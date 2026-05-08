import type { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { env } from '../config/env.js';
import { StripeService } from '../services/payments/stripe.service.js';
import { logger } from '../utils/logger.js';

const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2026-04-22.dahlia' });
const stripeService = new StripeService();

export function registerStripeRoutes(fastify: FastifyInstance): void {
  fastify.post('/stripe/webhook', async (req, reply) => {
    try {
      const signature = req.headers['stripe-signature'];
      if (typeof signature !== 'string') {
        await reply.code(400).send();
        return;
      }

      const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
      if (!rawBody) {
        logger.error('Stripe webhook missing rawBody (raw-body plugin misconfigured)');
        await reply.code(500).send();
        return;
      }

      const event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);

      if (event.type === 'payment_intent.succeeded') {
        const intent = event.data.object;
        await stripeService.handlePaymentSuccess(
          intent.id,
          intent.metadata ?? {},
        );
      } else if (event.type === 'payment_intent.payment_failed') {
        const intent = event.data.object;
        await stripeService.handlePaymentFailed(intent.id, intent.metadata ?? {});
      } else if (event.type === 'charge.refunded') {
        const charge = event.data.object;
        await stripeService.handleChargeRefunded(
          charge.id,
          typeof charge.payment_intent === 'string' ? charge.payment_intent : null,
        );
      }

      logger.info({ type: event.type, id: event.id }, 'Stripe webhook received');
      await reply.code(200).send({ received: true });
    } catch (err) {
      logger.warn({ err }, 'Stripe webhook signature verification failed');
      await reply.code(400).send();
    }
  });
}

