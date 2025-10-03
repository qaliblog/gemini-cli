/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';

interface ApiCyclingStatusProps {
  currentApiName: string;
  failedApis: string[];
  retryCount: number;
  maxRetries: number;
  isWaiting: boolean;
  waitTimeRemaining?: number;
}

export function ApiCyclingStatus({
  currentApiName,
  failedApis,
  retryCount,
  maxRetries,
  isWaiting,
  waitTimeRemaining,
}: ApiCyclingStatusProps): React.JSX.Element {
  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.warning}
      flexDirection="column"
      padding={1}
      marginTop={1}
    >
      <Text bold color={theme.text.warning}>
        🔄 API Cycling Status
      </Text>
      
      <Box marginTop={1}>
        <Text color={theme.text.primary}>
          Current API: <Text bold color={theme.text.secondary}>{currentApiName}</Text>
        </Text>
      </Box>
      
      {failedApis.length > 0 && (
        <Box marginTop={1}>
          <Text color={theme.text.primary}>
            Failed APIs: <Text color={theme.status.error}>{failedApis.join(', ')}</Text>
          </Text>
        </Box>
      )}
      
      <Box marginTop={1}>
        <Text color={theme.text.primary}>
          Retry: <Text bold>{retryCount}</Text> / <Text bold>{maxRetries}</Text>
        </Text>
      </Box>
      
      {isWaiting && waitTimeRemaining && (
        <Box marginTop={1}>
          <Text color={theme.text.warning}>
            ⏳ Waiting {waitTimeRemaining}s before retry...
          </Text>
        </Box>
      )}
      
      {isWaiting && !waitTimeRemaining && (
        <Box marginTop={1}>
          <Text color={theme.text.warning}>
            ⏳ Waiting for API rate limit reset...
          </Text>
        </Box>
      )}
    </Box>
  );
}