import { Controller, Get, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
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

  /**
   * Endpoint for testing 4.5 MB maximum payload limits (Spike S1).
   */
  @Post('v1/test/payload')
  @HttpCode(HttpStatus.OK)
  testPayload(@Body() body: any): { receivedBytes: number; status: string } {
    const jsonStr = JSON.stringify(body || {});
    const bytes = Buffer.byteLength(jsonStr, 'utf8');
    return {
      receivedBytes: bytes,
      status: 'accepted',
    };
  }
}
