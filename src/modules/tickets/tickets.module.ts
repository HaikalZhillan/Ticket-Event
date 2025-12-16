import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket } from 'src/entities/ticket.entity';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { Order } from 'src/entities/order.entity';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ticket, Order]),
    ConfigModule,
  ],
  exports: [TicketsService],
  controllers: [TicketsController],
  providers: [TicketsService],
})
export class TicketsModule {}