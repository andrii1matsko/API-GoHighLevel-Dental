import { ArgumentMetadata, Injectable, ValidationPipe } from '@nestjs/common';
import { GhlAppointmentCreateWebhookDto } from '../../integrations/gohighlevel/dto/webhook-appointment-create.dto';
import { GhlAppointmentMutationWebhookDto } from '../../integrations/gohighlevel/dto/webhook-appointment-mutation.dto';

const WEBHOOK_DTO_TYPES = new Set<unknown>([
  GhlAppointmentCreateWebhookDto,
  GhlAppointmentMutationWebhookDto,
]);

@Injectable()
export class AppValidationPipe extends ValidationPipe {
  private readonly webhookValidationPipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: false,
  });

  constructor() {
    super({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
  }

  transform(value: unknown, metadata: ArgumentMetadata): Promise<unknown> {
    if (metadata.metatype && WEBHOOK_DTO_TYPES.has(metadata.metatype)) {
      return this.webhookValidationPipe.transform(value, metadata);
    }

    return super.transform(value, metadata);
  }
}
