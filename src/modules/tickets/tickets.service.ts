import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Ticket, TicketStatus } from '../../entities/ticket.entity';
import { Order } from '../../entities/order.entity';
import * as QRCode from 'qrcode';
import PDFDocument from 'pdfkit';
import { createWriteStream, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);
  private readonly uploadDir: string;
  private readonly qrDir: string;
  private readonly publicUrl: string;

  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepository: Repository<Ticket>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    private readonly configService: ConfigService,
  ) {
    this.uploadDir = this.configService.get<string>('UPLOAD_DIR', './upload/tickets');
    this.qrDir = this.configService.get<string>('QR_DIR', './upload/qrcodes');
    this.publicUrl = this.configService.get<string>('PUBLIC_URL', 'http://localhost:3000');

    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    try {
      if (!existsSync(this.uploadDir)) mkdirSync(this.uploadDir, { recursive: true });
      if (!existsSync(this.qrDir)) mkdirSync(this.qrDir, { recursive: true });
    } catch (error: any) {
      this.logger.error(`Failed to create directories: ${error?.message ?? error}`);
      throw new InternalServerErrorException('Failed to initialize file storage');
    }
  }

  private generateTicketNumber(orderNumber: string, index: number): string {
    const seq = String(index + 1).padStart(3, '0');
    return `TCK-${orderNumber}-${seq}-${Date.now()}`;
  }

  private generateSeatNumber(offset: number, index: number): string {
    const n = offset + index;
    const rows = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const row = rows[Math.floor(n / 10)] ?? 'A';
    const seat = (n % 10) + 1;
    return `${row}${seat}`;
  }

  private async getExistingTicketCountForEvent(eventId: string): Promise<number> {
    return this.ticketRepository.count({ where: { eventId } });
  }

  private async generateQRCode(ticketId: string, ticketData: any): Promise<string> {
    try {
      const qrData = JSON.stringify({
        ticketId,
        data: ticketData,
        timestamp: new Date().toISOString(),
      });

      const fileName = `qr-${ticketId}.png`;
      const filePath = join(this.qrDir, fileName);

      await QRCode.toFile(filePath, qrData, {
        width: 300,
        margin: 2,
        errorCorrectionLevel: 'H',
        type: 'png',
      });

      return `${this.publicUrl}/upload/qrcodes/${fileName}`;
    } catch (error: any) {
      this.logger.error(`Failed to generate QR code: ${error?.message ?? error}`);
      throw new InternalServerErrorException('Failed to generate QR code');
    }
  }

  private async generatePDFTicket(ticket: Ticket, order: Order, event: any): Promise<string> {
    const fileName = `ticket-${ticket.id}.pdf`;
    const filePath = join(this.uploadDir, fileName);

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const stream = createWriteStream(filePath);

        doc.on('error', (error: any) => reject(error));
        stream.on('error', (error: any) => reject(error));

        doc.pipe(stream);

        doc.fontSize(28).font('Helvetica-Bold').text('EVENT TICKET', { align: 'center' }).moveDown();
        doc.fontSize(20).font('Helvetica-Bold').fillColor('#667eea').text(event?.title || 'Event', { align: 'center' }).moveDown(0.5);

        doc.fontSize(12).font('Helvetica').fillColor('#666')
          .text(`Ticket Number: ${ticket.ticketNumber}`, { align: 'center' })
          .text(`Ticket ID: ${ticket.id}`, { align: 'center' })
          .text(`Seat: ${ticket.seatNumber}`, { align: 'center' })
          .moveDown(2);

        doc.end();

        stream.on('finish', () => resolve(`${this.publicUrl}/upload/tickets/${fileName}`));
      } catch (error: any) {
        reject(error);
      }
    });
  }

  async generateTicketsForOrder(orderId: string): Promise<Ticket[]> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['event', 'user'],
    });

    if (!order) throw new NotFoundException(`Order '${orderId}' not found`);
    if (order.status !== 'paid') {
      throw new BadRequestException(`Order status must be 'paid', current status: ${order.status}`);
    }

    const existingTickets = await this.ticketRepository.find({ where: { orderId } });
    if (existingTickets.length > 0) return existingTickets;

    const event = order.event;
    const seatOffset = await this.getExistingTicketCountForEvent(order.eventId);

    const tickets: Ticket[] = [];

    for (let i = 0; i < order.quantity; i++) {
      const seatNumber = this.generateSeatNumber(seatOffset, i);
      const ticketNumber = this.generateTicketNumber(order.orderNumber, i);

      let ticket = this.ticketRepository.create({
        orderId: order.id,
        eventId: order.eventId,
        ticketNumber,
        seatNumber,
        qrCodeUrl: '',
        pdfUrl: '',
        createdBy: order.userId,
        status: TicketStatus.ACTIVE,
        paidAt: new Date(),
      });

      ticket = await this.ticketRepository.save(ticket);

      try {
        ticket.qrCodeUrl = await this.generateQRCode(ticket.id, {
          ticketId: ticket.id,
          ticketNumber: ticket.ticketNumber,
          seatNumber: ticket.seatNumber,
          orderId: order.id,
          eventId: order.eventId,
        });

        ticket.pdfUrl = await this.generatePDFTicket(ticket, order, event);

        ticket = await this.ticketRepository.save(ticket);
        tickets.push(ticket);
      } catch (err: any) {
        await this.ticketRepository.remove(ticket);
        throw err;
      }
    }

    return tickets;
  }

  async getTicketsByOrderId(orderId: string, userId: string, roleName?: string): Promise<any[]> {
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order '${orderId}' not found`);

    if (roleName !== 'admin' && (order as any).userId !== userId) {
      throw new ForbiddenException('You do not have permission to view these tickets');
    }

    const tickets = await this.ticketRepository.find({
      where: { orderId },
      relations: ['order', 'order.event'],
    });

    if (tickets.length === 0) throw new NotFoundException('No tickets found for this order');

    return tickets.map((ticket) => this.formatTicketResponse(ticket));
  }

  async downloadTicket(ticketId: string, userId: string, roleName?: string): Promise<{ filePath: string; fileName: string }> {
    const ticket = await this.ticketRepository.findOne({
      where: { id: ticketId },
      relations: ['order'],
    });
    if (!ticket) throw new NotFoundException(`Ticket '${ticketId}' not found`);

    if (roleName !== 'admin' && (ticket.order as any).userId !== userId) {
      throw new ForbiddenException('You do not have permission to download this ticket');
    }

    const pdfUrl = ticket.pdfUrl || '';
    const match = pdfUrl.match(/\/upload\/tickets\/(.+)$/);
    if (!match) throw new BadRequestException('Invalid PDF path');

    const fileNameOnDisk = match[1];

    const relativePath = join('upload', 'tickets', fileNameOnDisk);

    const absolutePath = join(process.cwd(), relativePath);
    if (!existsSync(absolutePath)) throw new NotFoundException('Ticket file not found on disk');

    return {
      filePath: relativePath,
      fileName: `ticket-${ticket.seatNumber}.pdf`,
    };
  }

  async validateTicket(ticketId: string): Promise<{ valid: boolean; message: string; ticket?: any }> {
    const ticket = await this.ticketRepository.findOne({
      where: { id: ticketId },
      relations: ['order', 'order.event', 'order.user'],
    });

    if (!ticket) return { valid: false, message: 'Ticket not found' };

    if (ticket.status !== TicketStatus.ACTIVE) {
      return {
        valid: false,
        message: `Ticket status is '${ticket.status}', only 'active' tickets can be checked in`,
        ticket: this.formatTicketResponse(ticket),
      };
    }

    if (ticket.checkedIn) {
      return {
        valid: false,
        message: `Ticket already checked in at ${ticket.checkedInAt ? new Date(ticket.checkedInAt).toLocaleString('id-ID') : '-'}`,
        ticket: this.formatTicketResponse(ticket),
      };
    }

    return { valid: true, message: 'Ticket is valid and ready for check-in', ticket: this.formatTicketResponse(ticket) };
  }

  async checkInTicket(ticketId: string, checkedInBy?: string): Promise<{ message: string; ticket: any }> {
    const ticket = await this.ticketRepository.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException(`Ticket '${ticketId}' not found`);

    if (ticket.status !== TicketStatus.ACTIVE) {
      throw new BadRequestException(`Ticket status is '${ticket.status}', only active tickets can be checked in`);
    }
    if (ticket.checkedIn) {
      throw new BadRequestException(`Ticket already checked in at ${ticket.checkedInAt ? new Date(ticket.checkedInAt).toLocaleString('id-ID') : '-'}`);
    }

    ticket.checkedIn = true;
    ticket.checkedInAt = new Date();
    ticket.status = TicketStatus.USED;
    ticket.checkedInBy = checkedInBy ?? null;

    await this.ticketRepository.save(ticket);
    return { message: 'Ticket checked in successfully', ticket: this.formatTicketResponse(ticket) };
  }

    async batchCancelTickets(
    ticketIds: string[],
    reason?: string,
  ): Promise<{ cancelled: number; errors: any[] }> {
    if (!ticketIds || ticketIds.length === 0) {
      throw new BadRequestException('No ticket IDs provided');
    }

    if (ticketIds.length > 500) {
      throw new BadRequestException('Maximum 500 tickets per batch operation');
    }

    const cancelled: string[] = [];
    const errors: { ticketId: string; error: string }[] = [];

    for (const ticketId of ticketIds) {
      try {
        const ticket = await this.ticketRepository.findOne({
          where: { id: ticketId },
        });

        if (!ticket) {
          errors.push({ ticketId, error: 'Ticket not found' });
          continue;
        }

        if (ticket.status === TicketStatus.USED) {
          errors.push({ ticketId, error: 'Cannot cancel used ticket' });
          continue;
        }

        ticket.status = TicketStatus.CANCELLED;
        ticket.cancelledAt = new Date();
        ticket.notes = reason || 'Cancelled by batch operation';

        await this.ticketRepository.save(ticket);
        cancelled.push(ticket.id);
      } catch (err: any) {
        errors.push({
          ticketId,
          error: err?.message ?? String(err),
        });
      }
    }

    this.logger.log(
      `Batch cancelled ${cancelled.length} tickets, ${errors.length} errors`,
    );

    return { cancelled: cancelled.length, errors };
  }


  private formatTicketResponse(ticket: Ticket): any {
    return {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      seatNumber: ticket.seatNumber,
      status: ticket.status,
      qrCodeUrl: ticket.qrCodeUrl,
      pdfUrl: ticket.pdfUrl,
      checkedIn: ticket.checkedIn,
      checkedInAt: ticket.checkedInAt,
      checkedInBy: ticket.checkedInBy,
      attendeeName: ticket.attendeeName,
      attendeeEmail: ticket.attendeeEmail,
      createdAt: ticket.createdAt,
    };
  }
}
