import {
  Stack,
  Text,
  Group,
  Badge,
  Checkbox,
  Switch,
  Tooltip,
} from '@mantine/core';
import { IconPalette } from '@tabler/icons-react';
import type { ProjectConfig, SessionProjectConfig } from '@orchy/types';
import { GlassSurface } from '../../theme';

interface ProjectSelectionPanelProps {
  projects: string[];
  projectConfigs: Record<string, ProjectConfig>;
  sessionProjectConfigs: SessionProjectConfig[];
  onConfigChange: (configs: SessionProjectConfig[]) => void;
}

export function ProjectSelectionPanel({
  projects,
  projectConfigs,
  sessionProjectConfigs,
  onConfigChange,
}: ProjectSelectionPanelProps) {
  const getConfig = (projectName: string): SessionProjectConfig => {
    return sessionProjectConfigs.find(c => c.name === projectName) || {
      name: projectName,
      included: true,
    };
  };

  const updateConfig = (projectName: string, updates: Partial<SessionProjectConfig>) => {
    const newConfigs = sessionProjectConfigs.map(c =>
      c.name === projectName ? { ...c, ...updates } : c
    );
    // If project not in list, add it
    if (!newConfigs.find(c => c.name === projectName)) {
      newConfigs.push({
        name: projectName,
        included: true,
        ...updates,
      });
    }
    onConfigChange(newConfigs);
  };

  return (
    <Stack gap="xs">
      <Text fw={600} size="sm" c="dimmed">
        Session Projects
      </Text>

      {projects.map(projectName => {
        const config = getConfig(projectName);
        const projectConfig = projectConfigs[projectName];
        const hasDesign = !!projectConfig?.attachedDesign;

        return (
          <GlassSurface key={projectName} p="xs">
            <Stack gap="xs">
              {/* Project name with include checkbox */}
              <Group justify="space-between" wrap="nowrap">
                <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                  <Checkbox
                    checked={config.included}
                    onChange={(e) => updateConfig(projectName, { included: e.currentTarget.checked })}
                    size="sm"
                  />
                  <Text size="sm" fw={500} truncate style={{ minWidth: 0 }}>
                    {projectName}
                  </Text>
                </Group>
                {hasDesign && (
                  <Tooltip label={`Design: ${projectConfig.attachedDesign}`}>
                    <Badge
                      size="xs"
                      variant="light"
                      color="grape"
                      leftSection={<IconPalette size={10} />}
                    >
                      {projectConfig.attachedDesign}
                    </Badge>
                  </Tooltip>
                )}
              </Group>

              {/* Options when included */}
              {config.included && (
                <Group gap="md" pl="xl">
                  <Group gap={4}>
                    <Switch
                      size="xs"
                      checked={config.readOnly || false}
                      onChange={(e) => updateConfig(projectName, { readOnly: e.currentTarget.checked })}
                    />
                    <Text size="xs" c="dimmed">Read Only</Text>
                  </Group>

                  {hasDesign && (
                    <Group gap={4}>
                      <Switch
                        size="xs"
                        checked={config.designEnabled || false}
                        onChange={(e) => updateConfig(projectName, { designEnabled: e.currentTarget.checked })}
                      />
                      <Text size="xs" c="dimmed">Use Design</Text>
                    </Group>
                  )}
                </Group>
              )}
            </Stack>
          </GlassSurface>
        );
      })}

      {projects.length === 0 && (
        <Text size="sm" c="dimmed" ta="center" py="md">
          No projects in workspace
        </Text>
      )}
    </Stack>
  );
}
