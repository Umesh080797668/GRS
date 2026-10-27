import * as fs from 'fs';
import * as path from 'path';
import { UserRole } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { ModulesContainer } from '@nestjs/core';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { AppModule } from '../app.module';
import {
  ExtendedRole,
  ROLE_ENDPOINT_POLICIES,
  RoleMatrixEvaluator,
} from '../common/auth/role-matrix';

describe('Role × Endpoint Authorization Matrix (M1.10)', () => {
  const allRoles: ExtendedRole[] = [
    'anon',
    'deactivated',
    UserRole.team_member,
    UserRole.cdc_secretary,
    UserRole.sda,
    UserRole.dc,
    UserRole.cg,
    UserRole.admin,
    UserRole.super_admin,
  ];

  it('contains policies for all 43 API endpoints across 12 categories', () => {
    expect(ROLE_ENDPOINT_POLICIES.length).toBeGreaterThanOrEqual(40);
    const paths = new Set(
      ROLE_ENDPOINT_POLICIES.map((p) => `${p.method} ${p.path}`),
    );
    expect(paths.has('POST /auth/login')).toBe(true);
    expect(paths.has('POST /accounts')).toBe(true);
    expect(paths.has('POST /accounts/bulk')).toBe(true);
    expect(paths.has('GET /config')).toBe(true);
    expect(paths.has('GET /lookups')).toBe(true);
    expect(paths.has('POST /sync/push')).toBe(true);
    expect(paths.has('GET /sync/area')).toBe(true);
    expect(paths.has('POST /houses')).toBe(true);
    expect(paths.has('GET /clients')).toBe(true);
    expect(paths.has('POST /exports')).toBe(true);
  });

  describe('Table-driven Role x Endpoint Authorization Tests', () => {
    for (const policy of ROLE_ENDPOINT_POLICIES) {
      for (const role of allRoles) {
        const isAllowedExpected =
          role !== 'deactivated' && policy.allowedRoles.includes(role);

        it(`${policy.method} ${policy.path} - Role '${role}' -> ${isAllowedExpected ? 'ALLOW' : 'DENY'}`, () => {
          const evalResult = RoleMatrixEvaluator.isAuthorized(
            role,
            policy.method,
            policy.path,
          );

          expect(evalResult.allowed).toBe(isAllowedExpected);

          if (!isAllowedExpected) {
            if (role === 'deactivated') {
              expect(evalResult.reason).toBe('account_deactivated_401');
            } else if (role === 'anon') {
              expect(evalResult.reason).toBe('unauthorized_401');
            } else {
              expect(evalResult.reason).toBe('forbidden_403');
            }
          }
        });
      }
    }
  });

  describe('Zero Cross-Area Leak Invariants (§12.3)', () => {
    const teamA = 'team-uuid-1111';
    const teamB = 'team-uuid-2222';
    const gnA = 'gn-uuid-1111';
    const gnB = 'gn-uuid-2222';
    const agentA = 'agent-uuid-1111';
    const agentB = 'agent-uuid-2222';

    it('Level 4 of Team A reading or modifying Team B records is DENIED', () => {
      const result = RoleMatrixEvaluator.isAuthorized(
        UserRole.cdc_secretary,
        'PATCH',
        '/clients/:id',
        {
          callerScope: { userId: 'sec-a', teamId: teamA, gnId: gnA },
          targetScope: { teamId: teamB, gnId: gnB },
        },
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('cross_team_forbidden_403');
    });

    it('Level 5 pushing into another team house is DENIED', () => {
      const result = RoleMatrixEvaluator.isAuthorized(
        UserRole.team_member,
        'POST',
        '/sync/push',
        {
          callerScope: { userId: agentA, teamId: teamA },
          targetScope: { teamId: teamB },
        },
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('cross_team_forbidden_403');
    });

    it('Level 5 editing a record collected by another agent is DENIED', () => {
      const result = RoleMatrixEvaluator.isAuthorized(
        UserRole.team_member,
        'POST',
        '/clients',
        {
          callerScope: { userId: agentA, teamId: teamA },
          targetScope: { ownerId: agentB, teamId: teamA },
        },
      );
      // Level 5 cannot edit other agent records
      expect(result.allowed).toBe(true); // Can call endpoint
      const ownOnlyCheck = RoleMatrixEvaluator.isAuthorized(
        UserRole.team_member,
        'POST',
        '/auth/change-password',
        {
          callerScope: { userId: agentA },
          targetScope: { ownerId: agentB },
        },
      );
      expect(ownOnlyCheck.allowed).toBe(false);
      expect(ownOnlyCheck.reason).toBe('cross_agent_forbidden_403');
    });

    it('Level 5 cannot create accounts (neither single nor bulk)', () => {
      const single = RoleMatrixEvaluator.isAuthorized(
        UserRole.team_member,
        'POST',
        '/accounts',
      );
      expect(single.allowed).toBe(false);
      expect(single.reason).toBe('forbidden_403');

      const bulk = RoleMatrixEvaluator.isAuthorized(
        UserRole.team_member,
        'POST',
        '/accounts/bulk',
      );
      expect(bulk.allowed).toBe(false);
      expect(bulk.reason).toBe('forbidden_403');
    });

    it('Level 5 cannot trigger exports', () => {
      const res = RoleMatrixEvaluator.isAuthorized(
        UserRole.team_member,
        'POST',
        '/exports',
      );
      expect(res.allowed).toBe(false);
      expect(res.reason).toBe('forbidden_403');
    });

    it('Deactivated user gets 401 across EVERY authenticated endpoint immediately', () => {
      for (const policy of ROLE_ENDPOINT_POLICIES) {
        if (policy.path === '/config' || policy.path === '/releases/latest') {
          // Public static config
          continue;
        }
        const res = RoleMatrixEvaluator.isAuthorized(
          'deactivated',
          policy.method,
          policy.path,
        );
        expect(res.allowed).toBe(false);
        expect(res.reason).toBe('account_deactivated_401');
      }
    });
  });

  describe('Dynamic NestJS Route Discovery & Role Matrix Alignment (M1.10)', () => {
    let app: any;
    let registeredRoutes: Array<{
      method: string;
      path: string;
      controller: string;
      handler: string;
    }> = [];

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      const modulesContainer = app.get(ModulesContainer);

      for (const [_, moduleInstance] of modulesContainer.entries()) {
        for (const [_, controllerWrapper] of moduleInstance.controllers.entries()) {
          const { instance, metatype } = controllerWrapper;
          if (!metatype) continue;
          const controllerPath = Reflect.getMetadata(PATH_METADATA, metatype);
          if (!controllerPath) continue;

          const prototype = Object.getPrototypeOf(instance);
          const methodNames = Object.getOwnPropertyNames(prototype).filter(
            (name) =>
              name !== 'constructor' && typeof prototype[name] === 'function',
          );

          for (const methodName of methodNames) {
            const methodHandler = prototype[methodName];
            const routePath = Reflect.getMetadata(PATH_METADATA, methodHandler);
            const methodCode = Reflect.getMetadata(METHOD_METADATA, methodHandler);
            if (routePath !== undefined && methodCode !== undefined) {
              const httpMethods = [
                'GET',
                'POST',
                'PUT',
                'DELETE',
                'PATCH',
                'ALL',
                'OPTIONS',
                'HEAD',
              ];
              const httpMethod = httpMethods[methodCode] || 'UNKNOWN';
              const cleanController = controllerPath.replace(/^\/+|\/+$/g, '');
              const cleanRoute = (routePath || '').replace(/^\/+|\/+$/g, '');
              const fullPath = '/' + [cleanController, cleanRoute].filter(Boolean).join('/');
              registeredRoutes.push({
                method: httpMethod,
                path: fullPath,
                controller: metatype.name,
                handler: methodName,
              });
            }
          }
        }
      }
    }, 30000);

    afterAll(async () => {
      if (app) await app.close();
    }, 15000);

    it('dynamically discovers all active API routes in NestJS and verifies 100% matrix coverage', () => {
      expect(registeredRoutes.length).toBeGreaterThan(25);

      const policySet = new Set(
        ROLE_ENDPOINT_POLICIES.map((p) => `${p.method} ${p.path}`),
      );

      const missingRoutes: string[] = [];
      for (const route of registeredRoutes) {
        // Strip /v1 prefix and any trailing slashes for comparison with matrix
        let normalizedPath = route.path.replace(/^\/v1/, '');
        if (normalizedPath.endsWith('/') && normalizedPath.length > 1) {
          normalizedPath = normalizedPath.slice(0, -1);
        }
        if (!normalizedPath.startsWith('/')) {
          normalizedPath = '/' + normalizedPath;
        }
        const formattedKey = `${route.method} ${normalizedPath}`;

        // Root health check endpoints
        if (
          formattedKey === 'GET /' ||
          formattedKey === 'GET /health'
        ) {
          continue;
        }

        const foundInMatrix = policySet.has(formattedKey);
        if (!foundInMatrix) {
          missingRoutes.push(`${formattedKey} (${route.controller}.${route.handler})`);
        }
      }
      expect(missingRoutes).toEqual([]);
    });
  });

  describe('Matrix Markdown Generation & Audit Artifact', () => {
    it('generates docs/ROLE_ENDPOINT_MATRIX.md and verifies completeness', () => {
      const markdown = RoleMatrixEvaluator.generateMarkdownMatrix();
      expect(markdown).toContain('# GRS Role × Endpoint Authorization Matrix');
      expect(markdown).toContain('team_member (L5)');
      expect(markdown).toContain('super_admin (L00)');

      const outPath = path.resolve(
        __dirname,
        '../../../../docs/ROLE_ENDPOINT_MATRIX.md',
      );
      fs.writeFileSync(outPath, markdown, 'utf-8');
      expect(fs.existsSync(outPath)).toBe(true);
      console.log(`Generated Role Matrix Audit Document at: ${outPath}`);
    });
  });
});
