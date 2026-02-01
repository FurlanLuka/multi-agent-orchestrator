import { useState } from 'react';
import { Grid, Box, ScrollArea } from '@mantine/core';
import { SettingsSidebar, type SettingsTab } from './SettingsSidebar';
import { ProjectSettings } from './ProjectSettings';
import { WorkspaceSettings } from './WorkspaceSettings';
import { useOrchestrator } from '../../context/OrchestratorContext';
import { glass } from '../../theme';

interface SettingsPageProps {
  initialTab?: SettingsTab;
}

export function SettingsPage({ initialTab = 'projects' }: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const {
    projects,
    templates,
    workspaces,
    creatingProject,
    addingProject,
    dependencyCheck,
    port,
    createProjectFromTemplate,
    addProject,
    removeProject,
    updateProject,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
  } = useOrchestrator();

  return (
    <Grid gutter={0} h="100vh">
      <Grid.Col span="content">
        <Box
          h="100vh"
          style={{
            background: glass.surface.bg,
            backdropFilter: glass.surface.blur,
            WebkitBackdropFilter: glass.surface.blur,
            borderRight: glass.surface.border,
          }}
        >
          <SettingsSidebar
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        </Box>
      </Grid.Col>
      <Grid.Col span="auto">
        <ScrollArea h="100vh" p="xl">
          {activeTab === 'projects' && (
            <ProjectSettings
              projects={projects}
              templates={templates}
              creatingProject={creatingProject}
              addingProject={addingProject}
              gitAvailable={dependencyCheck?.git.available ?? true}
              port={port}
              onCreateProject={createProjectFromTemplate}
              onAddProject={addProject}
              onRemoveProject={removeProject}
              onUpdateProject={updateProject}
            />
          )}
          {activeTab === 'workspaces' && (
            <WorkspaceSettings
              workspaces={workspaces}
              availableProjects={Object.keys(projects)}
              onCreateWorkspace={createWorkspace}
              onUpdateWorkspace={updateWorkspace}
              onDeleteWorkspace={deleteWorkspace}
            />
          )}
        </ScrollArea>
      </Grid.Col>
    </Grid>
  );
}
