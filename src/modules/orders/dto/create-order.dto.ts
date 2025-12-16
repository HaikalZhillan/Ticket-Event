import { IsInt, IsNotEmpty, IsUUID, Min, IsArray, ValidateNested, IsOptional } from "class-validator";
import { Type } from "class-transformer";

export class AttendeeDto {
    @IsNotEmpty()
    name: string;

    @IsNotEmpty()
    email: string;

}
export class CreateOrderDto {
    @IsUUID()
    @IsNotEmpty({ message: 'Event ID is required' })
    eventId: string;

    @IsInt()
    @Min(1, { message: 'Quantity must be at least 1' })
    quantity: number;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AttendeeDto)
    attendeeData?: AttendeeDto[];
}