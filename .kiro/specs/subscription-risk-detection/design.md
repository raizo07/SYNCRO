# Design Document: Subscription Risk Detection System

## Overview

The Subscription Risk Detection System is a proactive monitoring service that analyzes subscription health and computes risk levels to prevent payment failures. The system evaluates multiple risk factors including consecutive failed renewals, balance projections, and approval expiration status to assign a categorical risk level (LOW, MEDIUM, HIGH) to each subscription.

The system integrates with the existing subscription management infrastructure, notification system, and scheduler service to provide automated daily risk assessments and real-time risk score access via API endpoints.

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    HTTP Layer (Express)                  │
│  - Routes (/api/risk-score)                              │
│  - Authentication & Authorization                        │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                 Service Layer                            │
│  - RiskDetectionService: Risk computation & storage      │
│  - SchedulerService: Daily recalculation trigger         │
│  - NotificationService: Alert delivery                   │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                 Data Layer                               │
│  - Supabase (PostgreSQL)                                │
│    - subscriptions table                                 │
│    - subscription_risk_scores table (new)                │
│    - subscription_renewal_attempts table (new)           │
│    - subscription_approvals table (new)                  │
└─────────────────────────────────────────────────────────┘
```

### Integration Points

1. **Subscription Service**: Read subscription data for risk analysis
2. **Scheduler Service**: Trigger daily risk recalculation
3. **Notification System**: Send alerts when risk levels change to HIGH
4. **Authentication Middleware**: Secure API endpoints
5. **Database**: Store risk scores and historical data

## Components and Interfaces

### 1. RiskDetectionService

Core service responsible for risk computation and management.

```typescript
interface RiskDetectionService {
  // Compute risk level for a single subscription
  computeRiskLevel(subscriptionId: string): Promise<RiskAssessment>;
  
  // Recalculate risk for all active subscriptions
  recalculateAllRisks(): Promise<RiskRecalculationResult>;
  
  // Get current risk score for a subscription
  getRiskScore(subscriptionId: string, userId: string): Promise<RiskScore>;
  
  // Get risk scores for all user subscriptions
  getUserRiskScores(userId: string): Promise<RiskScore[]>;
  
  // Record a renewal attempt (success or failure)
  recordRenewalAttempt(
    subscriptionId: string,
    success: boolean,
    errorMessage?: string
  ): Promise<void>;
}
```

### 2. Risk Factor Evaluators

Individual evaluators for each risk factor:

```typescript
interface RiskFactorEvaluator {
  evaluate(subscription: Subscription, context: RiskContext): RiskWeight;
}

class ConsecutiveFailuresEvaluator implements RiskFactorEvaluator {
  evaluate(subscription: Subscription, context: RiskContext): RiskWeight;
}

class BalanceProjectionEvaluator implements RiskFactorEvaluator {
  evaluate(subscription: Subscription, context: RiskContext): RiskWeight;
}

class ApprovalExpirationEvaluator implements RiskFactorEvaluator {
  evaluate(subscription: Subscription, context: RiskContext): RiskWeight;
}
```

### 3. Risk Aggregator

Combines individual risk factors into overall risk level:

```typescript
interface RiskAggregator {
  aggregate(riskWeights: RiskWeight[]): RiskLevel;
}
```

### 4. API Routes

Express routes for risk score access:

```typescript
// GET /api/risk-score/:subscriptionId
// GET /api/risk-score (all user subscriptions)
router.get('/api/risk-score/:subscriptionId?', authenticate, getRiskScore);
```

## Data Models

### RiskScore

```typescript
interface RiskScore {
  id: string;
  subscription_id: string;
  user_id: string;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  risk_factors: RiskFactor[];
  last_calculated_at: string;
  created_at: string;
  updated_at: string;
}
```

### RiskFactor

```typescript
interface RiskFactor {
  factor_type: 'consecutive_failures' | 'balance_projection' | 'approval_expiration';
  weight: 'NONE' | 'MEDIUM' | 'HIGH';
  details: Record<string, any>;
}
```

### RiskAssessment

```typescript
interface RiskAssessment {
  subscription_id: string;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  risk_factors: RiskFactor[];
  computed_at: string;
}
```

### RenewalAttempt

```typescript
interface RenewalAttempt {
  id: string;
  subscription_id: string;
  attempt_date: string;
  success: boolean;
  error_message?: string;
  created_at: string;
}
```

### SubscriptionApproval

```typescript
interface SubscriptionApproval {
  id: string;
  subscription_id: string;
  user_id: string;
  approval_type: 'renewal' | 'payment';
  expires_at: string;
  status: 'active' | 'expired' | 'revoked';
  created_at: string;
  updated_at: string;
}
```

### Database Schema

```sql
-- Risk scores table
CREATE TABLE subscription_risk_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
  risk_factors JSONB NOT NULL DEFAULT '[]',
  last_calculated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(subscription_id)
);

-- Renewal attempts table
CREATE TABLE subscription_renewal_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  attempt_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  success BOOLEAN NOT NULL,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Subscription approvals table
CREATE TABLE subscription_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  approval_type TEXT NOT NULL CHECK (approval_type IN ('renewal', 'payment')),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_risk_scores_subscription ON subscription_risk_scores(subscription_id);
CREATE INDEX idx_risk_scores_user ON subscription_risk_scores(user_id);
CREATE INDEX idx_risk_scores_level ON subscription_risk_scores(risk_level);
CREATE INDEX idx_renewal_attempts_subscription ON subscription_renewal_attempts(subscription_id);
CREATE INDEX idx_renewal_attempts_date ON subscription_renewal_attempts(attempt_date DESC);
CREATE INDEX idx_approvals_subscription ON subscription_approvals(subscription_id);
CREATE INDEX idx_approvals_expires ON subscription_approvals(expires_at);
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Risk level output validity
*For any* subscription analyzed by the Risk Detection System, the computed risk level must be exactly one of: LOW, MEDIUM, or HIGH
**Validates: Requirements 1.1**

### Property 2: Risk aggregation produces single level
*For any* subscription with multiple risk factors present, the aggregation function must produce exactly one risk level value
**Validates: Requirements 1.2**

### Property 3: All active subscriptions processed
*For any* recalculation run, all subscriptions with status='active' must have their risk scores computed and stored
**Validates: Requirements 1.4, 5.2**

### Property 4: Risk level changes persist immediately
*For any* subscription where risk level is computed, querying the database immediately after should return the newly computed risk level
**Validates: Requirements 1.5**

### Property 5: Consecutive failures medium weight threshold
*For any* subscription with 1 or 2 consecutive failed renewal attempts, the consecutive failures evaluator must contribute MEDIUM weight to the risk assessment
**Validates: Requirements 2.2**

### Property 6: Consecutive failures high weight threshold
*For any* subscription with 3 or more consecutive failed renewal attempts, the consecutive failures evaluator must contribute HIGH weight to the risk assessment
**Validates: Requirements 2.3**

### Property 7: Successful renewal resets counter
*For any* subscription, recording a successful renewal attempt must set the consecutive failure count to zero
**Validates: Requirements 2.4**

### Property 8: Consecutive vs total failures separation
*For any* subscription, the consecutive failure count and total historical failure count must be tracked independently such that a successful renewal resets consecutive but not total
**Validates: Requirements 2.5**

### Property 9: Balance projection comparison
*For any* subscription with a next billing date, the balance projection evaluator must compare the projected balance against the subscription price
**Validates: Requirements 3.1**

### Property 10: Sufficient balance no risk increase
*For any* subscription where projected balance is at least 120% of the renewal amount, the balance projection evaluator must contribute NONE weight
**Validates: Requirements 3.2**

### Property 11: Low balance medium risk
*For any* subscription where projected balance is between 100% and 120% of the renewal amount, the balance projection evaluator must contribute MEDIUM weight
**Validates: Requirements 3.3**

### Property 12: Insufficient balance high risk
*For any* subscription where projected balance is below 100% of the renewal amount, the balance projection evaluator must contribute HIGH weight
**Validates: Requirements 3.4**

### Property 13: Renewal date used in projection
*For any* subscription with a next_billing_date, the balance projection calculation must use that date in determining projected balance
**Validates: Requirements 3.5**

### Property 14: Approval expiration checked
*For any* subscription that requires approval, the approval evaluator must check the expires_at timestamp against current time
**Validates: Requirements 4.1**

### Property 15: Valid approval no risk increase
*For any* subscription with an approval where expires_at > current_time and status='active', the approval evaluator must contribute NONE weight
**Validates: Requirements 4.2**

### Property 16: Expired approval high risk
*For any* subscription with an approval where expires_at <= current_time or no approval exists, the approval evaluator must contribute HIGH weight
**Validates: Requirements 4.3**

### Property 17: No approval requirement skips evaluation
*For any* subscription that does not require approval (no approval record exists and not configured to require approval), the approval evaluator must not be invoked
**Validates: Requirements 4.4**

### Property 18: Current timestamp for expiration
*For any* approval expiration check, the system must use the current timestamp at evaluation time, not a cached or stale timestamp
**Validates: Requirements 4.5**

### Property 19: Batch recalculation persists all scores
*For any* batch recalculation operation, all computed risk scores must be written to the subscription_risk_scores table before the operation completes
**Validates: Requirements 5.3**

### Property 20: API returns risk for valid subscription
*For any* authenticated GET request to /api/risk-score/:subscriptionId where the subscription exists and belongs to the user, the response must contain the current risk level
**Validates: Requirements 6.2**

### Property 21: API returns all user subscriptions
*For any* authenticated GET request to /api/risk-score without a subscription ID, the response must contain risk scores for all subscriptions where user_id matches the authenticated user
**Validates: Requirements 6.3**

### Property 22: API response format completeness
*For any* successful API response from /api/risk-score, the JSON must contain subscription_id, risk_level, and last_calculated_at fields
**Validates: Requirements 6.6**

### Property 23: HIGH risk triggers notification
*For any* subscription where risk level changes from (LOW or MEDIUM) to HIGH, a notification must be triggered through the notification system
**Validates: Requirements 7.1**

### Property 24: Risk decrease triggers resolution notification
*For any* subscription where risk level changes from HIGH to (MEDIUM or LOW), a resolution notification must be triggered
**Validates: Requirements 7.2**

### Property 25: Notification payload completeness
*For any* risk notification triggered, the payload must include subscription details (id, name, price) and the specific risk factors that contributed to the risk level
**Validates: Requirements 7.3**

### Property 26: Multiple HIGH risks generate multiple notifications
*For any* recalculation where N subscriptions transition to HIGH risk, exactly N notifications must be triggered
**Validates: Requirements 7.4**

### Property 27: No duplicate notifications for unchanged HIGH risk
*For any* subscription that remains at HIGH risk level between two consecutive recalculations, no new notification should be triggered on the second recalculation
**Validates: Requirements 7.5**

### Property 28: Risk calculation logging
*For any* risk calculation performed, a log entry must be created containing the subscription_id, input risk factors, and resulting risk level
**Validates: Requirements 8.2**

## Error Handling

### Error Categories

1. **Data Validation Errors**
   - Invalid subscription ID
   - Missing required fields
   - Invalid risk level values
   - Response: 400 Bad Request with error details

2. **Authentication/Authorization Errors**
   - Unauthenticated requests
   - Accessing other users' risk scores
   - Response: 401 Unauthorized or 403 Forbidden

3. **Not Found Errors**
   - Subscription doesn't exist
   - Risk score not yet calculated
   - Response: 404 Not Found

4. **Calculation Errors**
   - Missing renewal attempt data
   - Invalid balance projection inputs
   - Missing approval data when required
   - Handling: Log error, assign default LOW risk, retry on next recalculation

5. **Database Errors**
   - Connection failures
   - Query timeouts
   - Constraint violations
   - Handling: Retry with exponential backoff, log error, alert monitoring

6. **Notification Errors**
   - Notification service unavailable
   - Invalid notification payload
   - Handling: Log error, queue for retry, don't block risk calculation

### Error Recovery Strategies

1. **Graceful Degradation**: If balance projection fails, continue with other risk factors
2. **Retry Logic**: Database operations retry up to 3 times with exponential backoff
3. **Partial Success**: If some subscriptions fail during batch recalculation, continue processing others
4. **Audit Trail**: All errors logged with context for debugging and monitoring
5. **Default Safe Values**: On calculation error, default to LOW risk rather than failing

## Testing Strategy

### Unit Testing

Unit tests will verify specific components and edge cases:

1. **Risk Factor Evaluators**
   - Test each evaluator with boundary values
   - Test zero failures case
   - Test missing data handling
   - Test threshold boundaries (e.g., exactly 120% balance)

2. **Risk Aggregator**
   - Test aggregation with all NONE weights → LOW
   - Test aggregation with one HIGH weight → HIGH
   - Test aggregation with multiple MEDIUM weights → MEDIUM
   - Test empty risk factors array

3. **API Endpoints**
   - Test authentication middleware
   - Test authorization (user can only access own scores)
   - Test 404 for invalid subscription IDs
   - Test response format validation

4. **Notification Integration**
   - Test notification triggered on HIGH risk
   - Test no notification on unchanged risk
   - Test notification payload structure

### Property-Based Testing

Property-based tests will verify universal correctness properties across many randomly generated inputs. We will use **fast-check** (for TypeScript/JavaScript) as the property-based testing library.

Each property-based test will run a minimum of 100 iterations to ensure comprehensive coverage of the input space.

1. **Property 1: Risk level output validity**
   - Generate random subscriptions with various risk factors
   - Verify output is always LOW, MEDIUM, or HIGH
   - **Feature: subscription-risk-detection, Property 1: Risk level output validity**

2. **Property 2: Risk aggregation produces single level**
   - Generate random combinations of risk weights
   - Verify aggregation always produces exactly one risk level
   - **Feature: subscription-risk-detection, Property 2: Risk aggregation produces single level**

3. **Property 3: All active subscriptions processed**
   - Generate random sets of subscriptions with mixed statuses
   - Verify all active subscriptions have risk scores after recalculation
   - **Feature: subscription-risk-detection, Property 3: All active subscriptions processed**

4. **Property 4: Risk level changes persist immediately**
   - Generate random subscriptions and risk levels
   - Compute risk, immediately query database
   - Verify stored value matches computed value
   - **Feature: subscription-risk-detection, Property 4: Risk level changes persist immediately**

5. **Property 5-6: Consecutive failures thresholds**
   - Generate subscriptions with 0-10 consecutive failures
   - Verify correct weight assignment based on count
   - **Feature: subscription-risk-detection, Property 5-6: Consecutive failures thresholds**

6. **Property 7: Successful renewal resets counter**
   - Generate subscriptions with various failure counts
   - Record successful renewal
   - Verify consecutive count is zero
   - **Feature: subscription-risk-detection, Property 7: Successful renewal resets counter**

7. **Property 10-12: Balance projection thresholds**
   - Generate subscriptions with various balance/price ratios
   - Verify correct weight assignment based on ratio
   - **Feature: subscription-risk-detection, Property 10-12: Balance projection thresholds**

8. **Property 15-16: Approval expiration**
   - Generate subscriptions with approvals at various expiration states
   - Verify correct weight assignment based on expiration
   - **Feature: subscription-risk-detection, Property 15-16: Approval expiration**

9. **Property 20-21: API response correctness**
   - Generate random user IDs and subscription sets
   - Verify API returns correct subscriptions for each user
   - **Feature: subscription-risk-detection, Property 20-21: API response correctness**

10. **Property 23-24: Notification triggers**
    - Generate subscriptions with various risk level transitions
    - Verify notifications triggered only on appropriate transitions
    - **Feature: subscription-risk-detection, Property 23-24: Notification triggers**

11. **Property 27: No duplicate notifications**
    - Generate subscriptions that remain at HIGH risk
    - Run multiple recalculations
    - Verify notification count equals transition count
    - **Feature: subscription-risk-detection, Property 27: No duplicate notifications**

### Integration Testing

Integration tests will verify end-to-end workflows:

1. **Daily Recalculation Flow**
   - Trigger scheduler
   - Verify all active subscriptions processed
   - Verify risk scores updated in database
   - Verify notifications sent for HIGH risk

2. **API Integration**
   - Make authenticated requests
   - Verify correct data returned
   - Verify authorization enforced

3. **Notification Integration**
   - Trigger risk level change
   - Verify notification service called
   - Verify notification payload correct

### Test Data Generators

For property-based testing, we will create smart generators:

```typescript
// Generate subscriptions with controlled risk factors
const subscriptionGenerator = fc.record({
  id: fc.uuid(),
  user_id: fc.uuid(),
  name: fc.string(),
  price: fc.float({ min: 1, max: 1000 }),
  billing_cycle: fc.constantFrom('monthly', 'yearly', 'quarterly'),
  status: fc.constantFrom('active', 'cancelled', 'paused'),
  next_billing_date: fc.date(),
});

// Generate renewal attempts with controlled success/failure patterns
const renewalAttemptsGenerator = fc.array(
  fc.record({
    success: fc.boolean(),
    attempt_date: fc.date(),
  }),
  { minLength: 0, maxLength: 10 }
);

// Generate balance scenarios
const balanceScenarioGenerator = fc.record({
  projected_balance: fc.float({ min: 0, max: 2000 }),
  renewal_amount: fc.float({ min: 1, max: 1000 }),
});
```

## Performance Considerations

### Scalability

1. **Batch Processing**: Recalculation processes subscriptions in batches of 100 to avoid memory issues
2. **Database Indexing**: Indexes on subscription_id, user_id, and risk_level for fast queries
3. **Caching**: Risk scores cached for 1 hour to reduce database load on API requests
4. **Parallel Processing**: Risk calculations for independent subscriptions can run in parallel

### Optimization Strategies

1. **Lazy Evaluation**: Only fetch renewal attempts and approvals when needed for calculation
2. **Query Optimization**: Use JOIN queries to fetch subscription + risk data in single query
3. **Connection Pooling**: Reuse database connections across calculations
4. **Incremental Updates**: Only recalculate subscriptions with changed data (future enhancement)

### Monitoring Metrics

1. **Calculation Duration**: Time to compute risk for single subscription (target: <100ms)
2. **Batch Duration**: Time to recalculate all subscriptions (target: <5 minutes for 10k subscriptions)
3. **API Response Time**: Time to return risk score (target: <200ms)
4. **Error Rate**: Percentage of failed calculations (target: <1%)
5. **Notification Delivery Rate**: Percentage of successful notifications (target: >99%)

## Security Considerations

1. **Authentication**: All API endpoints require valid JWT token
2. **Authorization**: Users can only access risk scores for their own subscriptions
3. **Rate Limiting**: API endpoints limited to 100 requests per minute per user
4. **Input Validation**: All inputs validated and sanitized
5. **SQL Injection Prevention**: Parameterized queries used throughout
6. **Audit Logging**: All risk calculations and API access logged for audit trail

## Configuration

### Risk Factor Weights Configuration

```typescript
interface RiskWeightConfig {
  consecutiveFailures: {
    none: number;      // 0 failures
    medium: number;    // 1-2 failures
    high: number;      // 3+ failures
  };
  balanceProjection: {
    sufficient: number;    // >= 120%
    low: number;          // 100-120%
    insufficient: number; // < 100%
  };
  approvalExpiration: {
    valid: number;    // Not expired
    expired: number;  // Expired or missing
  };
}

const defaultWeights: RiskWeightConfig = {
  consecutiveFailures: { none: 0, medium: 5, high: 10 },
  balanceProjection: { sufficient: 0, low: 5, insufficient: 10 },
  approvalExpiration: { valid: 0, expired: 10 },
};
```

### Aggregation Rules

```typescript
// Risk level determined by highest weight
// HIGH: Any factor with weight >= 10
// MEDIUM: Any factor with weight >= 5 and < 10
// LOW: All factors with weight < 5
function aggregateRiskLevel(weights: number[]): RiskLevel {
  const maxWeight = Math.max(...weights, 0);
  if (maxWeight >= 10) return 'HIGH';
  if (maxWeight >= 5) return 'MEDIUM';
  return 'LOW';
}
```

## Deployment Considerations

1. **Database Migration**: Run schema migration to create new tables before deployment
2. **Initial Calculation**: Run one-time batch calculation for all existing subscriptions
3. **Scheduler Configuration**: Ensure cron job configured for daily recalculation
4. **Monitoring Setup**: Configure alerts for high error rates and slow calculations
5. **Rollback Plan**: Keep previous risk scores for 30 days to enable rollback if needed

## Future Enhancements

1. **Machine Learning**: Use ML models to predict risk based on historical patterns
2. **Real-time Calculation**: Trigger risk recalculation on subscription changes
3. **Custom Risk Factors**: Allow users to define custom risk factors
4. **Risk Trends**: Track risk level changes over time for trend analysis
5. **Predictive Alerts**: Alert users before risk level increases
6. **Risk Mitigation Suggestions**: Provide actionable recommendations to reduce risk
