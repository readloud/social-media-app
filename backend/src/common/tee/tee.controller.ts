import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { TrustedExecutionEnvironmentService } from './tee.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('tee')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class TeeController {
  constructor(private teeService: TrustedExecutionEnvironmentService) {}

  @Post('session/create')
  async createSession(@Body() data: { userId: string; purpose: string }) {
    return this.teeService.createEnclaveSession(data.userId, data.purpose);
  }

  @Post('schedule/process')
  async processSchedule(@Body() data: { sessionId: string; encryptedSchedule: EncryptedSchedule }) {
    return this.teeService.processScheduleInEnclave(data.sessionId, data.encryptedSchedule);
  }

  @Post('keys/rotate')
  @Roles('admin')
  async rotateKeys() {
    await this.teeService.rotateEnclaveKeys();
    return { message: 'Enclave keys rotated successfully' };
  }

  @Get('attestation')
  async getAttestation() {
    return this.teeService.getLatestAttestation();
  }
}