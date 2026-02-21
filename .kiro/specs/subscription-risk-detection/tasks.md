# Implementation Plan

- [x] 1. Create database schema and migrations
  - Create migration file for subscription_risk_scores table
  - Create migration file for subscription_renewal_attempts table
  - Create migration file for subscription_approvals table
  - Add indexes for performance optimization
  - Add RLS policies for security
  - _Requirements: 1.1, 1.5, 2.1-2.5, 3.1-3.5, 4.1-4.5_

- [x] 2. Implement core type definitions
  - Create risk-related TypeScript interfaces (RiskScore, RiskFactor, RiskAssessment, etc.)
  - Create RenewalAttempt and SubscriptionApproval types
  - Create configuration types for risk weights
  - _Requirements: 1.1, 8.1_

- [x] 3. Implement risk factor evaluators
- [x] 3.1 Create base RiskFactorEvaluator interface
  - Define evaluate method signature
  - Define RiskWeight type and constants
  - _Requirements: 1.1, 1.2_

- [x] 3.2 Implement ConsecutiveFailuresEvaluator
  - Fetch consecutive failure count from database
  - Apply threshold logic (0 = NONE, 1-2 = MEDIUM, 3+ = HIGH)
  - Return risk weight with details
  - _Requirements: 2.1, 2.2, 2.3_

- [ ]* 3.3 Write property test for ConsecutiveFailuresEvaluator
  - **Property 5-6: Consecutive failures thresholds**
  - **Validates: Requirements 2.2, 2.3**

- [x] 3.4 Implement BalanceProjectionEvaluator
  - Calculate projected balance based on next billing date
  - Compare against subscription price
  - Apply threshold logic (>=120% = NONE, 100-120% = MEDIUM, <100% = HIGH)
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ]* 3.5 Write property test for BalanceProjectionEvaluator
  - **Property 10-12: Balance projection thresholds**
  - **Validates: Requirements 3.2, 3.3, 3.4**

- [x] 3.6 Implement ApprovalExpirationEvaluator
  - Check if subscription requires approval
  - Fetch approval record from database
  - Check expiration against current timestamp
  - Apply logic (valid = NONE, expired/missing = HIGH)
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ]* 3.7 Write property test for ApprovalExpirationEvaluator
  - **Property 15-16: Approval expiration**
  - **Validates: Requirements 4.2, 4.3**

- [x] 4. Implement risk aggregation logic
- [x] 4.1 Create RiskAggregator class
  - Implement aggregate method
  - Apply aggregation rules (max weight determines level)
  - Handle edge cases (empty weights, all NONE)
  - _Requirements: 1.2, 1.3_

- [ ]* 4.2 Write property test for RiskAggregator
  - **Property 2: Risk aggregation produces single level**
  - **Validates: Requirements 1.2**

- [x] 5. Implement RiskDetectionService
- [x] 5.1 Create RiskDetectionService class structure
  - Set up constructor with configuration
  - Initialize evaluators and aggregator
  - Set up database client
  - _Requirements: 1.1, 8.1_

- [x] 5.2 Implement computeRiskLevel method
  - Fetch subscription data
  - Run all applicable evaluators
  - Aggregate risk weights
  - Return RiskAssessment object
  - _Requirements: 1.1, 1.2_

- [ ]* 5.3 Write property test for computeRiskLevel
  - **Property 1: Risk level output validity**
  - **Validates: Requirements 1.1**

- [x] 5.4 Implement saveRiskScore method
  - Upsert risk score to database
  - Handle conflicts (update existing)
  - Return saved risk score
  - _Requirements: 1.5_

- [ ]* 5.5 Write property test for risk persistence
  - **Property 4: Risk level changes persist immediately**
  - **Validates: Requirements 1.5**

- [x] 5.6 Implement getRiskScore method
  - Fetch risk score by subscription ID
  - Verify user ownership
  - Return risk score or throw error
  - _Requirements: 6.2_

- [x] 5.7 Implement getUserRiskScores method
  - Fetch all risk scores for user
  - Apply pagination if needed
  - Return array of risk scores
  - _Requirements: 6.3_

- [ ]* 5.8 Write property test for user risk scores
  - **Property 21: API returns all user subscriptions**
  - **Validates: Requirements 6.3**

- [x] 5.9 Implement recalculateAllRisks method
  - Fetch all active subscriptions in batches
  - Compute risk for each subscription
  - Save all risk scores
  - Track success/failure counts
  - Log errors without stopping batch
  - _Requirements: 1.4, 5.2, 5.3_

- [ ]* 5.10 Write property test for batch recalculation
  - **Property 3: All active subscriptions processed**
  - **Validates: Requirements 1.4, 5.2**

- [x] 5.11 Implement recordRenewalAttempt method
  - Insert renewal attempt record
  - Update consecutive failure count
  - Reset count to zero on success
  - _Requirements: 2.4, 2.5_

- [ ]* 5.12 Write property test for renewal attempt tracking
  - **Property 7: Successful renewal resets counter**
  - **Validates: Requirements 2.4**

- [x] 6. Integrate with notification system
- [x] 6.1 Implement risk change detection
  - Compare previous and new risk levels
  - Detect transitions to HIGH
  - Detect transitions from HIGH to lower
  - _Requirements: 7.1, 7.2_

- [x] 6.2 Implement notification triggering
  - Call notification service on HIGH risk transition
  - Call notification service on risk resolution
  - Build notification payload with subscription details and risk factors
  - Handle notification errors gracefully
  - _Requirements: 7.1, 7.2, 7.3_

- [ ]* 6.3 Write property test for notification triggers
  - **Property 23-24: Notification triggers**
  - **Validates: Requirements 7.1, 7.2**

- [x] 6.4 Implement notification deduplication
  - Track last notified risk level
  - Skip notification if risk unchanged
  - Update notification tracking on send
  - _Requirements: 7.5_

- [ ]* 6.5 Write property test for notification deduplication
  - **Property 27: No duplicate notifications**
  - **Validates: Requirements 7.5**

- [ ] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Create API routes and controllers
- [x] 8.1 Create risk-score routes file
  - Set up Express router
  - Define GET /api/risk-score/:subscriptionId route
  - Define GET /api/risk-score route (all user subscriptions)
  - Apply authentication middleware
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 8.2 Implement getRiskScore controller
  - Extract subscription ID from params
  - Extract user ID from auth token
  - Call RiskDetectionService.getRiskScore
  - Handle errors (404, 403, 500)
  - Return JSON response with risk data
  - _Requirements: 6.2, 6.4, 6.5, 6.6_

- [ ]* 8.3 Write property test for API response format
  - **Property 22: API response format completeness**
  - **Validates: Requirements 6.6**

- [x] 8.4 Implement getUserRiskScores controller
  - Extract user ID from auth token
  - Call RiskDetectionService.getUserRiskScores
  - Handle errors (401, 500)
  - Return JSON array of risk scores
  - _Requirements: 6.3, 6.6_

- [x] 9. Integrate with scheduler service
- [x] 9.1 Add daily risk recalculation job to scheduler
  - Add cron job to SchedulerService (runs daily at 2 AM UTC)
  - Call RiskDetectionService.recalculateAllRisks
  - Log start and completion
  - Handle errors and log failures
  - _Requirements: 5.1, 5.4, 5.5_

- [x] 9.2 Add manual trigger endpoint
  - Create POST /api/risk-score/recalculate endpoint (admin only)
  - Trigger immediate recalculation
  - Return status and counts
  - _Requirements: 5.1_

- [x] 10. Implement logging and monitoring
- [x] 10.1 Add risk calculation logging
  - Log each risk calculation with subscription ID, factors, and result
  - Log batch recalculation start/end with counts
  - Log errors with full context
  - _Requirements: 8.2_

- [ ]* 10.2 Write property test for calculation logging
  - **Property 28: Risk calculation logging**
  - **Validates: Requirements 8.2**

- [x] 10.3 Add performance metrics
  - Track calculation duration per subscription
  - Track batch recalculation duration
  - Track API response times
  - Log metrics for monitoring
  - _Requirements: Performance considerations_

- [x] 11. Implement configuration management
- [x] 11.1 Create risk weight configuration file
  - Define default weights for all risk factors
  - Create configuration schema
  - Add validation for configuration values
  - _Requirements: 8.1, 8.4_

- [x] 11.2 Load configuration at service initialization
  - Read configuration from file or environment
  - Validate configuration
  - Pass to evaluators and aggregator
  - _Requirements: 8.1, 8.4_

- [x] 12. Add error handling and recovery
- [x] 12.1 Implement graceful degradation
  - Handle missing renewal attempt data
  - Handle missing approval data
  - Continue with available risk factors
  - _Requirements: Error handling_

- [x] 12.2 Implement retry logic for database operations
  - Add exponential backoff for transient errors
  - Retry up to 3 times
  - Log retry attempts
  - _Requirements: Error handling_

- [x] 12.3 Implement default risk assignment on errors
  - Assign LOW risk when calculation fails
  - Log error details
  - Schedule retry on next recalculation
  - _Requirements: Error handling_

- [ ] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
