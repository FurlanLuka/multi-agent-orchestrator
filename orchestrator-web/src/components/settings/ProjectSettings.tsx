import { ProjectManager } from '../ProjectManager';
import type { ProjectConfig, ProjectTemplateConfig } from '@orchy/types';

interface ProjectSettingsProps {
  projects: Record<string, ProjectConfig>;
  templates: ProjectTemplateConfig[];
  creatingProject: boolean;
  addingProject: boolean;
  gitAvailable: boolean;
  port: number | null;
  onCreateProject: (options: any) => void;
  onAddProject: (options: any) => void;
  onRemoveProject: (name: string) => void;
  onUpdateProject: (name: string, updates: Partial<ProjectConfig>) => void;
}

export function ProjectSettings(props: ProjectSettingsProps) {
  return (
    <ProjectManager
      projects={props.projects}
      templates={props.templates}
      creatingProject={props.creatingProject}
      addingProject={props.addingProject}
      gitAvailable={props.gitAvailable}
      port={props.port}
      onCreateProject={props.onCreateProject}
      onAddProject={props.onAddProject}
      onRemoveProject={props.onRemoveProject}
      onUpdateProject={props.onUpdateProject}
    />
  );
}
