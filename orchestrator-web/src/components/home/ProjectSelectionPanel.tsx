import { useState } from 'react';
import {
  Stack,
  Text,
  Group,
  Badge,
  Tabs,
  UnstyledButton,
  ThemeIcon,
} from '@mantine/core';
import { IconFolder, IconPalette, IconEye, IconHammer } from '@tabler/icons-react';
import type { ProjectConfig, SessionProjectConfig } from '@orchy/types';
import { FormCard, GlassSurface } from '../../theme';

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
  const [activeTab, setActiveTab] = useState<string | null>('planning');

  const getConfig = (projectName: string): SessionProjectConfig => {
    return sessionProjectConfigs.find(c => c.name === projectName) || {
      name: projectName,
      included: true,
    };
  };

  const toggleProjectMode = (projectName: string) => {
    const config = getConfig(projectName);
    const newConfigs = sessionProjectConfigs.map(c =>
      c.name === projectName
        ? { ...c, readOnly: !c.readOnly }
        : c
    );
    // If project not in list, add it
    if (!newConfigs.find(c => c.name === projectName)) {
      newConfigs.push({
        name: projectName,
        included: true,
        readOnly: !config.readOnly,
      });
    }
    onConfigChange(newConfigs);
  };

  const planningProjects = projects.filter(p => {
    const config = getConfig(p);
    return config.included && !config.readOnly;
  });

  const readOnlyProjects = projects.filter(p => {
    const config = getConfig(p);
    return config.included && config.readOnly;
  });

  return (
    <FormCard
      style={{ height: '100%' }}
      title={
        <Tabs
          value={activeTab}
          onChange={setActiveTab}
          variant="unstyled"
          style={{ margin: '-12px -16px', width: 'calc(100% + 32px)' }}
        >
          <Tabs.List style={{ borderBottom: 'none' }}>
            <Tabs.Tab
              value="planning"
              leftSection={<IconHammer size={14} />}
              style={{
                padding: '12px 16px',
                fontWeight: activeTab === 'planning' ? 600 : 400,
                color: activeTab === 'planning' ? 'var(--mantine-color-peach-7)' : 'var(--mantine-color-dimmed)',
                borderBottom: activeTab === 'planning' ? '2px solid var(--mantine-color-peach-5)' : '2px solid transparent',
              }}
            >
              Planning
              {planningProjects.length > 0 && (
                <Badge size="xs" variant="light" color="peach" ml={6}>
                  {planningProjects.length}
                </Badge>
              )}
            </Tabs.Tab>
            <Tabs.Tab
              value="readonly"
              leftSection={<IconEye size={14} />}
              style={{
                padding: '12px 16px',
                fontWeight: activeTab === 'readonly' ? 600 : 400,
                color: activeTab === 'readonly' ? 'var(--mantine-color-sage-7)' : 'var(--mantine-color-dimmed)',
                borderBottom: activeTab === 'readonly' ? '2px solid var(--mantine-color-sage-5)' : '2px solid transparent',
              }}
            >
              Read Only
              {readOnlyProjects.length > 0 && (
                <Badge size="xs" variant="light" color="sage" ml={6}>
                  {readOnlyProjects.length}
                </Badge>
              )}
            </Tabs.Tab>
          </Tabs.List>
        </Tabs>
      }
    >
      <Stack gap="xs">
        {activeTab === 'planning' && (
          <>
            {planningProjects.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center" py="lg">
                No projects selected for planning.
                <br />
                <Text span size="xs">Click projects in Read Only tab to move them here.</Text>
              </Text>
            ) : (
              planningProjects.map(projectName => (
                <ProjectCard
                  key={projectName}
                  projectName={projectName}
                  projectConfig={projectConfigs[projectName]}
                  isReadOnly={false}
                  onToggle={() => toggleProjectMode(projectName)}
                />
              ))
            )}
          </>
        )}

        {activeTab === 'readonly' && (
          <>
            {readOnlyProjects.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center" py="lg">
                No read-only projects.
                <br />
                <Text span size="xs">Click projects in Planning tab to move them here.</Text>
              </Text>
            ) : (
              readOnlyProjects.map(projectName => (
                <ProjectCard
                  key={projectName}
                  projectName={projectName}
                  projectConfig={projectConfigs[projectName]}
                  isReadOnly={true}
                  onToggle={() => toggleProjectMode(projectName)}
                />
              ))
            )}
          </>
        )}

        {projects.length === 0 && (
          <Text size="sm" c="dimmed" ta="center" py="lg">
            No projects in workspace
          </Text>
        )}
      </Stack>
    </FormCard>
  );
}

interface ProjectCardProps {
  projectName: string;
  projectConfig: ProjectConfig | undefined;
  isReadOnly: boolean;
  onToggle: () => void;
}

function ProjectCard({ projectName, projectConfig, isReadOnly, onToggle }: ProjectCardProps) {
  const hasDesign = !!projectConfig?.attachedDesign;

  return (
    <UnstyledButton onClick={onToggle} style={{ width: '100%' }}>
      <GlassSurface
        p="sm"
        style={{
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
      >
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
            <ThemeIcon
              size="md"
              radius="md"
              variant="light"
              color={isReadOnly ? 'sage' : 'peach'}
            >
              <IconFolder size={14} />
            </ThemeIcon>
            <Stack gap={2} style={{ minWidth: 0 }}>
              <Text size="sm" fw={500} truncate>
                {projectName}
              </Text>
              {hasDesign && (
                <Group gap={4}>
                  <IconPalette size={10} style={{ color: 'var(--mantine-color-grape-5)' }} />
                  <Text size="xs" c="grape.5" truncate>
                    {projectConfig?.attachedDesign}
                  </Text>
                </Group>
              )}
            </Stack>
          </Group>

          <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
            {isReadOnly ? 'Click to plan' : 'Click for read-only'}
          </Text>
        </Group>
      </GlassSurface>
    </UnstyledButton>
  );
}
