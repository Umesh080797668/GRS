import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AppService, HealthCheckResponse } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) { }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  async getHealth(): Promise<HealthCheckResponse> {
    return this.appService.checkHealth();
  }

  @Post('v1/test/payload')
  @HttpCode(HttpStatus.OK)
  testPayload(@Body() body: any) {
    const receivedBytes = Buffer.byteLength(JSON.stringify(body || {}));
    return {
      status: 'accepted',
      receivedBytes,
    };
  }
}
