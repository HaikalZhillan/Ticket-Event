import { IsEnum, IsOptional } from 'class-validator';

export enum ExportFormat {
  CSV = 'csv',
  JSON = 'json',
}

export class ExportTicketsDto {
  @IsEnum(ExportFormat)
  @IsOptional()
  format?: ExportFormat = ExportFormat.CSV;
}