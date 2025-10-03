import { Module } from '@nestjs/common';
import { FamousService } from './famous.service';

@Module({
  providers: [FamousService],
  exports: [FamousService],
})
export class FamousModule {}
