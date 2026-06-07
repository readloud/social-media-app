import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { AnomalyDetectionService } from './anomaly.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('anomaly-detection')
@UseGuards(AuthGuard('jwt'))
export class AnomalyDetectionController {
  constructor(private anomalyService: AnomalyDetectionService) {}

  @Post('check')
  async checkAnomaly(@Body() data: ScheduleMetrics) {
    return this.anomalyService.detectAnomalies(data);
  }

  @Post('network/check')
  async checkNetworkAnomaly(@Body() data: NetworkRequestData) {
    return this.anomalyService.detectNetworkAnomaly(data);
  }

  @Get('dashboard')
  @UseGuards(RolesGuard)
  @Roles('admin', 'security')
  async getDashboard() {
    return this.anomalyService.getAnomalyDashboard();
  }

  @Get('alerts/recent')
  async getRecentAlerts() {
    return this.anomalyService.getRecentAlerts(50);
  }

  @Post('train')
  @Roles('admin')
  async retrainModel() {
    await this.anomalyService.retrainModel();
    return { message: 'Model retraining started' };
  }
}