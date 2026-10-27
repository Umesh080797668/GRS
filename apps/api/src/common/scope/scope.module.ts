import { Global, Module } from '@nestjs/common';
import { ScopeService } from './scope.service';
import { ScopedRepository } from './scoped.repository';

@Global()
@Module({
  providers: [ScopeService, ScopedRepository],
  exports: [ScopeService, ScopedRepository],
})
export class ScopeModule {}
