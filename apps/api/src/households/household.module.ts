import { Module } from '@nestjs/common';
import { HouseholdController } from './household.controller';
import { TeamHousesController } from './team-houses.controller';
import { HouseholdService } from './household.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ScopeModule } from '../common/scope/scope.module';

@Module({
  imports: [PrismaModule, ScopeModule],
  controllers: [HouseholdController, TeamHousesController],
  providers: [HouseholdService],
  exports: [HouseholdService],
})
export class HouseholdModule { }
