import { IsUUID, IsNotEmpty } from 'class-validator';

export class ValidateTicketDto {
  @IsUUID()
  @IsNotEmpty()
  ticketId: string;
}