-- Atomic credit deduction and payment processing helpers.

CREATE OR REPLACE FUNCTION deduct_credit(user_id UUID, action_type TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_daily_count INTEGER;
  v_extra_credits INTEGER;
  v_reset_time TIMESTAMPTZ;
BEGIN
  SELECT daily_generation_count, extra_credits, daily_generation_reset
  INTO v_daily_count, v_extra_credits, v_reset_time
  FROM users
  WHERE id = user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_reset_time < NOW() - INTERVAL '1 day' THEN
    UPDATE users
    SET daily_generation_count = 0,
        daily_generation_reset = NOW()
    WHERE id = user_id;
    v_daily_count = 0;
  END IF;

  IF v_daily_count < 5 THEN
    UPDATE users
    SET daily_generation_count = daily_generation_count + 1,
        updated_at = NOW()
    WHERE id = user_id;
    RETURN TRUE;
  END IF;

  IF v_extra_credits > 0 THEN
    UPDATE users
    SET extra_credits = extra_credits - 1,
        updated_at = NOW()
    WHERE id = user_id;
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION process_payment(
  p_user_id UUID,
  p_payment_intent_id TEXT,
  p_credits INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  v_exists UUID;
BEGIN
  SELECT id INTO v_exists
  FROM payment_transactions
  WHERE stripe_payment_intent_id = p_payment_intent_id;

  IF v_exists IS NOT NULL THEN
    RETURN TRUE;
  END IF;

  INSERT INTO payment_transactions (
    user_id,
    stripe_payment_intent_id,
    amount_cents,
    currency,
    credits_purchased,
    status
  ) VALUES (
    p_user_id,
    p_payment_intent_id,
    0,
    'usd',
    p_credits,
    'succeeded'
  );

  UPDATE users
  SET extra_credits = extra_credits + p_credits,
      updated_at = NOW()
  WHERE id = p_user_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

