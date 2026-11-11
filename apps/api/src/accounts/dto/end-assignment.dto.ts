import { IsOptional, IsUUID } from 'class-validator';

/**
 * Optional body for POST /v1/accounts/:id/end-assignment
 * Targets a specific active assignment when a CDC Secretary holds multiple GN divisions.
 */
export class EndAssignmentDto {
  @IsUUID()
  @IsOptional()
  assignmentId?: string;
}

