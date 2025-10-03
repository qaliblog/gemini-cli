/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { RadioButtonSelect } from '../components/shared/RadioButtonSelect.js';
import type { LoadedSettings } from '../../config/settings.js';
import { SettingScope } from '../../config/settings.js';
// AuthType is imported for type checking but not used directly in this component
import { useKeypress } from '../hooks/useKeypress.js';
import { AuthState } from '../types.js';

export interface ApiConfig {
  id: string;
  name: string;
  apiKey: string;
  type: 'gemini' | 'vertex';
  enabled: boolean;
}

interface MultipleApiConfigProps {
  settings: LoadedSettings;
  setAuthState: (state: AuthState) => void;
  onBack: () => void;
}

export function MultipleApiConfig({
  settings,
  setAuthState,
  onBack,
}: MultipleApiConfigProps): React.JSX.Element {
  const [apis, setApis] = useState<ApiConfig[]>(() => {
    const savedApis = settings.merged.security?.auth?.multipleApis || [];
    return savedApis.length > 0 ? savedApis : [
      {
        id: 'default-1',
        name: 'API Key 1',
        apiKey: '',
        type: 'gemini',
        enabled: true,
      }
    ];
  });

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState<'list' | 'add' | 'edit'>('list');

  const saveApis = useCallback(() => {
    settings.setValue(SettingScope.User, 'security.auth.multipleApis', apis);
  }, [settings, apis]);

  const handleAddApi = useCallback(() => {
    const newApi: ApiConfig = {
      id: `api-${Date.now()}`,
      name: `API Key ${apis.length + 1}`,
      apiKey: '',
      type: 'gemini',
      enabled: true,
    };
    setApis([...apis, newApi]);
    setSelectedIndex(apis.length);
    setMode('edit');
  }, [apis]);

  const handleEditApi = useCallback((index: number) => {
    setSelectedIndex(index);
    setMode('edit');
  }, []);

  const handleDeleteApi = useCallback((index: number) => {
    if (apis.length > 1) {
      const newApis = apis.filter((_, i) => i !== index);
      setApis(newApis);
      saveApis();
    }
  }, [apis, saveApis]);

  const handleToggleApi = useCallback((index: number) => {
    const newApis = [...apis];
    newApis[index].enabled = !newApis[index].enabled;
    setApis(newApis);
    saveApis();
  }, [apis, saveApis]);

  const handleBackToList = useCallback(() => {
    setMode('list');
    saveApis();
  }, [saveApis]);

  const handleFinish = useCallback(() => {
    saveApis();
    setAuthState(AuthState.Authenticated);
  }, [saveApis, setAuthState]);

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        if (mode === 'edit') {
          handleBackToList();
        } else {
          onBack();
        }
      }
    },
    { isActive: true },
  );

  if (mode === 'list') {
    const items = [
      ...apis.map((api, index) => ({
        label: `${api.enabled ? '✓' : '✗'} ${api.name} (${api.type})`,
        value: `api-${index}`,
        key: `api-${index}`,
      })),
      {
        label: '+ Add New API',
        value: 'add',
        key: 'add',
      },
      {
        label: '✓ Finish Configuration',
        value: 'finish',
        key: 'finish',
      },
    ];

    const handleSelect = (value: string) => {
      if (value === 'add') {
        handleAddApi();
      } else if (value === 'finish') {
        handleFinish();
      } else if (value.startsWith('api-')) {
        const index = parseInt(value.split('-')[1], 10);
        handleEditApi(index);
      }
    };

    return (
      <Box
        borderStyle="round"
        borderColor={theme.border.default}
        flexDirection="column"
        padding={1}
        width="100%"
      >
        <Text bold color={theme.text.primary}>
          Multiple API Configuration
        </Text>
        <Box marginTop={1}>
          <Text color={theme.text.primary}>
            Configure multiple Gemini APIs for automatic cycling and failover.
          </Text>
        </Box>
        <Box marginTop={1}>
          <RadioButtonSelect
            items={items}
            initialIndex={0}
            onSelect={handleSelect}
          />
        </Box>
        <Box marginTop={1}>
          <Text color={theme.text.secondary}>
            (Use Enter to select, Escape to go back)
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color={theme.text.secondary}>
            ✓ = Enabled, ✗ = Disabled
          </Text>
        </Box>
      </Box>
    );
  }

  if (mode === 'edit') {
    const currentApi = apis[selectedIndex];
    
    const typeItems = [
      {
        label: 'Gemini API Key',
        value: 'gemini',
        key: 'gemini',
      },
      {
        label: 'Vertex AI',
        value: 'vertex',
        key: 'vertex',
      },
    ];

    const actionItems = [
      {
        label: currentApi.enabled ? 'Disable API' : 'Enable API',
        value: 'toggle',
        key: 'toggle',
      },
      {
        label: 'Delete API',
        value: 'delete',
        key: 'delete',
      },
      {
        label: 'Save & Back',
        value: 'save',
        key: 'save',
      },
    ];

    const handleTypeSelect = (type: string) => {
      const newApis = [...apis];
      newApis[selectedIndex].type = type as 'gemini' | 'vertex';
      setApis(newApis);
    };

    const handleActionSelect = (action: string) => {
      if (action === 'toggle') {
        handleToggleApi(selectedIndex);
      } else if (action === 'delete') {
        handleDeleteApi(selectedIndex);
        handleBackToList();
      } else if (action === 'save') {
        handleBackToList();
      }
    };

    return (
      <Box
        borderStyle="round"
        borderColor={theme.border.default}
        flexDirection="column"
        padding={1}
        width="100%"
      >
        <Text bold color={theme.text.primary}>
          Edit API: {currentApi.name}
        </Text>
        
        <Box marginTop={1}>
          <Text color={theme.text.primary}>API Type:</Text>
        </Box>
        <Box marginTop={1}>
          <RadioButtonSelect
            items={typeItems}
            initialIndex={currentApi.type === 'gemini' ? 0 : 1}
            onSelect={handleTypeSelect}
          />
        </Box>

        <Box marginTop={1}>
          <Text color={theme.text.primary}>
            API Key: {currentApi.apiKey ? '***' + currentApi.apiKey.slice(-4) : 'Not set'}
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color={theme.text.secondary}>
            (Set GEMINI_API_KEY_1, GEMINI_API_KEY_2, etc. environment variables)
          </Text>
        </Box>

        <Box marginTop={1}>
          <Text color={theme.text.primary}>Actions:</Text>
        </Box>
        <Box marginTop={1}>
          <RadioButtonSelect
            items={actionItems}
            initialIndex={0}
            onSelect={handleActionSelect}
          />
        </Box>

        <Box marginTop={1}>
          <Text color={theme.text.secondary}>
            (Use Enter to select, Escape to go back)
          </Text>
        </Box>
      </Box>
    );
  }

  return <Box />;
}