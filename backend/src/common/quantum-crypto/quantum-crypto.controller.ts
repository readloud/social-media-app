import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { QuantumResistantCryptoService } from './quantum-resistant.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('quantum-crypto')
@UseGuards(AuthGuard('jwt'))
export class QuantumCryptoController {
  constructor(private quantumService: QuantumResistantCryptoService) {}

  @Post('keys/kyber')
  async generateKyberKeys(@CurrentUser() user: any) {
    return this.quantumService.generateKyberKeyPair(user.id);
  }

  @Post('keys/sphincs')
  async generateSphincsKeys(@CurrentUser() user: any) {
    return this.quantumService.generateSphincsKeyPair(user.id);
  }

  @Post('encapsulate')
  async encapsulate(@Body() data: { publicKey: string }) {
    return this.quantumService.encapsulateSecret(data.publicKey);
  }

  @Post('decapsulate')
  async decapsulate(@Body() data: { ciphertext: string }) {
    // Get user's private key from session
    const user = await this.getCurrentUser();
    const key = await this.quantumService.getUserQuantumKey(user.id);
    return this.quantumService.decapsulateSecret(key.privateKey, data.ciphertext);
  }

  @Post('hybrid/encrypt')
  async hybridEncrypt(
    @Body() data: { plaintext: string; recipientPublicKey: string }
  ) {
    return this.quantumService.hybridEncrypt(
      Buffer.from(data.plaintext, 'utf8'),
      data.recipientPublicKey
    );
  }

  @Post('hybrid/decrypt')
  async hybridDecrypt(@Body() ciphertext: HybridCiphertext) {
    const user = await this.getCurrentUser();
    const key = await this.quantumService.getUserQuantumKey(user.id);
    const decrypted = await this.quantumService.hybridDecrypt(ciphertext, key.privateKey);
    return { plaintext: decrypted.toString('utf8') };
  }

  @Post('sign/hybrid')
  async hybridSign(@Body() data: { message: string }) {
    const user = await this.getCurrentUser();
    const quantumKey = await this.quantumService.getUserQuantumKey(user.id);
    const classicalKey = await this.getUserClassicalKey(user.id);
    
    return this.quantumService.hybridSign(
      Buffer.from(data.message, 'utf8'),
      classicalKey,
      quantumKey.privateKey
    );
  }

  @Post('channel/establish')
  async establishChannel(@Body() data: { recipientId: string }) {
    const user = await this.getCurrentUser();
    return this.quantumService.establishQuantumSecureChannel(user.id, data.recipientId);
  }

  @Post('keys/rotate')
  @Roles('admin')
  async rotateKeys(@Body() data: { userId: string }) {
    return this.quantumService.rotateQuantumKeys(data.userId);
  }

  @Get('keys/status')
  async getKeyStatus(@CurrentUser() user: any) {
    return this.quantumService.getQuantumKeyStatus(user.id);
  }
}