import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Order } from './order.entity';
import { Event } from './event.entity';
import { User } from './user.entity';

export enum TicketStatus {
  ACTIVE = 'active',
  USED = 'used',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

@Entity('tickets')
@Index(['orderId', 'eventId'])
@Index(['seatNumber', 'eventId'], { unique: true })
@Index(['status', 'eventId'])
export class Ticket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  orderId: string;

  @ManyToOne(() => Order, (order) => order.tickets, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column({ type: 'uuid' })
  eventId: string;

  @ManyToOne(() => Event, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'eventId' })
  event: Event;

  @Column({ type: 'varchar', length: 100, unique: true })
  ticketNumber: string;

  @Column({ type: 'varchar', length: 100 })
  seatNumber: string;

  @Column({ type: 'text', nullable: true })
  qrCodeUrl: string;

  @Column({ type: 'text', nullable: true })
  pdfUrl: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  attendeeName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  attendeeEmail: string;

  @Column({ type: 'varchar', length: 50, default: TicketStatus.ACTIVE })
  status: TicketStatus;

  @Column({ type: 'boolean', default: false })
  checkedIn: boolean;

  @Column({ type: 'timestamp', nullable: true })
  checkedInAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  checkedInBy: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'checkedInBy' })
  checkedInByUser: User;

  @Column({ type: 'uuid' })
  createdBy: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'createdBy' })
  creator: User;

  @Column({ type: 'timestamp', nullable: true })
  paidAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt: Date;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'boolean', default: false })
  isTransferable: boolean;

  @Column({ type: 'uuid', nullable: true })
  transferredFrom: string;

  @Column({ type: 'uuid', nullable: true })
  transferredTo: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
