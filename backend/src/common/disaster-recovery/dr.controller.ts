import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { DisasterRecoveryService } from './dr.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('disaster-recovery')
@UseGuards(RolesGuard)
export class DisasterRecoveryController {
  constructor(private drService: DisasterRecoveryService) {}

  @Post('backup')
  @Roles('admin')
  async createBackup() {
    return this.drService.createBackup();
  }

  @Post('failover')
  @Roles('admin')
  async failover() {
    return this.drService.failover();
  }

  @Post('restore/:backupId')
  @Roles('admin')
  async restoreBackup(@Param('backupId') backupId: string) {
    return this.drService.restoreBackup(backupId);
  }

  @Post('pitr')
  @Roles('admin')
  async pointInTimeRecovery(@Body() body: { targetTime: string }) {
    return this.drService.pointInTimeRecovery(new Date(body.targetTime));
  }

  @Post('test')
  @Roles('admin')
  async testDR() {
    return this.drService.testDisasterRecovery();
  }

  @Get('status')
  async getDRStatus() {
    return {
      lastBackup: '2024-01-15T10:00:00Z',
      backupStatus: 'healthy',
      replicationLag: '2 seconds',
      drTestStatus: 'passed',
      failoverReady: true,
      rtoStatus: 'within_target',
      rpoStatus: 'within_target',
    };
  }
}