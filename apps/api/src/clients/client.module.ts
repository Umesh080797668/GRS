import { Module } from '@nestjs/common';
import { ClientController } from './client.controller';
import { ClientService } from './client.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ScopeModule } from '../common/scope/scope.module';

@Module({
  imports: [PrismaModule, ScopeModule],
  controllers: [ClientController],
  providers: [ClientService],
  exports: [ClientService],
})
export class ClientModule {}
