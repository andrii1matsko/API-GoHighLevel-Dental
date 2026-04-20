import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class SignUpDto {
  @ApiProperty({ example: 'doctor@opusdental.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8, example: 'StrongPassword123!' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ example: 'Dr. Jane Doe' })
  @IsOptional()
  @IsString()
  name?: string;
}
