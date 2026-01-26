import { useState, useEffect } from 'react';
import {
  TextInput,
  Textarea,
  Button,
  Stack,
  Text,
  Select,
  Group,
  Card,
  Badge,
  Checkbox,
  Loader,
  Divider,
  Progress,
  Alert,
  SegmentedControl,
  ActionIcon,
  Collapse,
  Switch,
  Tooltip,
  SimpleGrid,
  Accordion,
  Grid,
  Title,
  ScrollArea,
} from '@mantine/core';
import { IconPlus, IconFolder, IconServer, IconBrowser, IconCheck, IconFolderPlus, IconTrash, IconChevronDown, IconChevronRight, IconDeviceFloppy, IconGitBranch, IconAlertTriangle, IconShield, IconShieldOff } from '@tabler/icons-react';
import type { ProjectTemplateConfig, ProjectConfig, ProjectTemplate } from '@aio/types';

// Permission types from backend
interface PermissionOption {
  id: string;
  label: string;
  description: string;
  category: 'file' | 'bash' | 'mcp';
}

interface PermissionCategory {
  id: string;
  label: string;
  description: string;
  permissions: PermissionOption[];
}

interface PermissionGroup {
  id: string;
  label: string;
  description: string;
  permissions: string[];
}

interface PermissionsConfig {
  categories: PermissionCategory[];
  groups: PermissionGroup[];
  templates: Record<string, string[]>;
  alwaysDenied: string[];
}

interface AddProjectOptions {
  name: string;
  path: string;
  devServer?: {
    command: string;
    readyPattern: string;
    env?: Record<string, string>;
    port?: number;
    url?: string;
  };
  buildCommand?: string;
  hasE2E?: boolean;
  e2eInstructions?: string;
  dependencyInstall?: boolean;
  gitEnabled?: boolean;
  mainBranch?: string;
  permissions?: {
    dangerouslyAllowAll?: boolean;
    allow: string[];
  };
}

interface CreateProjectOptions {
  name: string;
  targetPath: string;
  template: ProjectTemplate;
  dependencyInstall: boolean;
  hasE2E: boolean;
  gitEnabled: boolean;
  mainBranch: string;
  permissions?: {
    dangerouslyAllowAll?: boolean;
    allow: string[];
  };
}

interface ProjectManagerProps {
  projects: Record<string, ProjectConfig>;
  templates: ProjectTemplateConfig[];
  creatingProject: boolean;
  addingProject: boolean;
  gitAvailable?: boolean;
  onCreateProject: (options: CreateProjectOptions) => void;
  onAddProject: (options: AddProjectOptions) => void;
  onRemoveProject: (name: string) => void;
  onUpdateProject: (name: string, updates: Partial<ProjectConfig>) => void;
}

export function ProjectManager({ projects, templates, creatingProject, addingProject, gitAvailable = true, onCreateProject, onAddProject, onRemoveProject, onUpdateProject }: ProjectManagerProps) {
  const [formMode, setFormMode] = useState<'template' | 'existing'>('existing');

  // Expanded project for editing E2E instructions, dev server URL, and git settings
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [editingE2EInstructions, setEditingE2EInstructions] = useState<string>('');
  const [editingDevServerUrl, setEditingDevServerUrl] = useState<string>('');
  const [editingGitEnabled, setEditingGitEnabled] = useState<boolean>(false);
  const [editingMainBranch, setEditingMainBranch] = useState<string>('');

  // Permissions state
  const [permissionsConfig, setPermissionsConfig] = useState<PermissionsConfig | null>(null);
  const [editingPermissions, setEditingPermissions] = useState<string[]>([]);
  const [editingDangerouslyAllowAll, setEditingDangerouslyAllowAll] = useState<boolean>(false);

  // Fetch permissions config on mount
  useEffect(() => {
    fetch('http://localhost:3456/api/permissions')
      .then(res => res.json())
      .then(data => setPermissionsConfig(data))
      .catch(err => console.error('Failed to fetch permissions config:', err));
  }, []);

  // Template form state
  const [name, setName] = useState('');
  const [targetPath, setTargetPath] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate | null>(null);
  const [templateDependencyInstall, setTemplateDependencyInstall] = useState(true);
  const [templateHasE2E, setTemplateHasE2E] = useState(true);
  const [templateGitEnabled, setTemplateGitEnabled] = useState(false);
  const [templateMainBranch, setTemplateMainBranch] = useState('main');

  // Template form permissions
  const [templatePermissions, setTemplatePermissions] = useState<string[]>([]);
  const [templateDangerouslyAllowAll, setTemplateDangerouslyAllowAll] = useState(false);

  // Manual form state
  const [manualName, setManualName] = useState('');
  const [manualPath, setManualPath] = useState('');
  const [manualCommand, setManualCommand] = useState('npm run dev');
  const [manualReadyPattern, setManualReadyPattern] = useState('ready|listening|started|compiled');
  const [manualBuildCommand, setManualBuildCommand] = useState('npm run build');
  const [manualDevServerUrl, setManualDevServerUrl] = useState('');
  const [manualHasE2E, setManualHasE2E] = useState(false);
  const [manualE2EInstructions, setManualE2EInstructions] = useState('');
  const [manualDependencyInstall, setManualDependencyInstall] = useState(false);
  const [manualGitEnabled, setManualGitEnabled] = useState(false);
  const [manualMainBranch, setManualMainBranch] = useState('main');
  const [manualPermissions, setManualPermissions] = useState<string[]>([]);
  const [manualDangerouslyAllowAll, setManualDangerouslyAllowAll] = useState(false);

  // Pre-populate permissions when template is selected
  useEffect(() => {
    if (selectedTemplate && permissionsConfig?.templates) {
      const templateDefaults = permissionsConfig.templates[selectedTemplate] || [];
      setTemplatePermissions(templateDefaults);
    }
  }, [selectedTemplate, permissionsConfig]);

  const [creatingName, setCreatingName] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<string | null>(null);

  const isLoading = creatingProject || addingProject;

  // Track when creation completes
  useEffect(() => {
    if (!isLoading && creatingName) {
      // Creation finished
      setJustCreated(creatingName);
      setCreatingName(null);
      // Reset form fields
      setName('');
      setTargetPath('');
      setSelectedTemplate(null);
      setTemplateDependencyInstall(true);
      setTemplateHasE2E(true);
      setTemplateGitEnabled(false);
      setTemplateMainBranch('main');
      setManualName('');
      setManualPath('');
      setManualCommand('npm run dev');
      setManualReadyPattern('ready|listening|started|compiled');
      setManualBuildCommand('npm run build');
      setManualDevServerUrl('');
      setManualHasE2E(false);
      setManualE2EInstructions('');
      setManualDependencyInstall(false);
      setManualGitEnabled(false);
      setManualMainBranch('main');
      setManualPermissions([]);
      setManualDangerouslyAllowAll(false);
      setTemplatePermissions([]);
      setTemplateDangerouslyAllowAll(false);
      setTimeout(() => setJustCreated(null), 3000); // Clear success after 3s
    }
  }, [isLoading, creatingName]);

  const handleCreateFromTemplate = () => {
    if (name.trim() && targetPath.trim() && selectedTemplate) {
      setCreatingName(name.trim());
      onCreateProject({
        name: name.trim(),
        targetPath: targetPath.trim(),
        template: selectedTemplate,
        dependencyInstall: templateDependencyInstall,
        hasE2E: templateHasE2E,
        gitEnabled: templateGitEnabled,
        mainBranch: templateMainBranch.trim() || 'main',
        permissions: templateDangerouslyAllowAll
          ? { dangerouslyAllowAll: true, allow: [] }
          : { allow: templatePermissions },
      });
    }
  };

  const handleAddExisting = () => {
    if (manualName.trim() && manualPath.trim()) {
      setCreatingName(manualName.trim());
      onAddProject({
        name: manualName.trim(),
        path: manualPath.trim(),
        devServer: {
          command: manualCommand.trim() || 'npm run dev',
          readyPattern: manualReadyPattern.trim() || 'ready|listening|started|compiled',
          url: manualDevServerUrl.trim() || undefined,
        },
        buildCommand: manualBuildCommand.trim() || 'npm run build',
        hasE2E: manualHasE2E,
        e2eInstructions: manualE2EInstructions.trim() || undefined,
        dependencyInstall: manualDependencyInstall,
        gitEnabled: manualGitEnabled,
        mainBranch: manualMainBranch.trim() || 'main',
        permissions: manualDangerouslyAllowAll
          ? { dangerouslyAllowAll: true, allow: [] }
          : { allow: manualPermissions },
      });
    }
  };

  const templateOptions = templates.map(t => ({
    value: t.name,
    label: t.displayName,
  }));

  const selectedTemplateConfig = templates.find(t => t.name === selectedTemplate);

  const projectList = Object.entries(projects);

  return (
    <Grid gutter="lg">
      {/* LEFT: Existing Projects */}
      <Grid.Col span={{ base: 12, md: 6 }}>
        <Stack gap="md">
          <Title order={5}>Your Projects</Title>

          {/* Success message */}
          {justCreated && (
            <Alert icon={<IconCheck size={16} />} color="green" variant="light">
              Project "{justCreated}" created successfully!
            </Alert>
          )}

          {/* Creating/Adding progress */}
          {isLoading && creatingName && (
            <Card padding="sm" withBorder bg="blue.0">
              <Stack gap="xs">
                <Group gap="xs">
                  <Loader size={14} />
                  <Text size="sm" fw={500}>
                    {creatingProject ? `Creating "${creatingName}"...` : `Adding "${creatingName}"...`}
                  </Text>
                </Group>
                <Progress value={100} animated size="xs" />
                <Text size="xs" c="dimmed">
                  {creatingProject
                    ? (templateDependencyInstall ? 'Copying template and installing dependencies...' : 'Copying template files...')
                    : (manualDependencyInstall ? 'Validating path and installing dependencies...' : 'Validating path and updating configuration...')}
                </Text>
              </Stack>
            </Card>
          )}

          {/* Existing Projects */}
          {projectList.length > 0 ? (
            <ScrollArea.Autosize mah={500}>
            <Stack gap="xs">
              {projectList.map(([projectName, config]) => {
              const isExpanded = expandedProject === projectName;
              return (
                <Card key={projectName} padding="xs" withBorder>
                  <Group justify="space-between">
                    <Group gap="xs">
                      <ActionIcon
                        size="xs"
                        variant="subtle"
                        onClick={() => {
                          if (isExpanded) {
                            setExpandedProject(null);
                            setEditingE2EInstructions('');
                            setEditingDevServerUrl('');
                            setEditingGitEnabled(false);
                            setEditingMainBranch('');
                            setEditingPermissions([]);
                            setEditingDangerouslyAllowAll(false);
                          } else {
                            setExpandedProject(projectName);
                            setEditingE2EInstructions(config.e2eInstructions || '');
                            setEditingDevServerUrl(config.devServer?.url || '');
                            setEditingGitEnabled(config.gitEnabled || false);
                            setEditingMainBranch(config.mainBranch || 'main');
                            setEditingPermissions(config.permissions?.allow || []);
                            setEditingDangerouslyAllowAll(config.permissions?.dangerouslyAllowAll || false);
                          }
                        }}
                      >
                        {isExpanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                      </ActionIcon>
                      <Text fw={500}>{projectName}</Text>
                    </Group>
                    <Group gap="xs">
                      <Badge size="xs" variant="light">
                        {config.devServer.command}
                      </Badge>
                      {config.hasE2E && (
                        <Badge size="xs" color="green" variant="light">
                          E2E
                        </Badge>
                      )}
                      {config.gitEnabled && (
                        <Badge size="xs" color="violet" variant="light" leftSection={<IconGitBranch size={10} />}>
                          Git
                        </Badge>
                      )}
                      {config.permissions?.dangerouslyAllowAll ? (
                        <Badge size="xs" color="red" variant="light" leftSection={<IconShieldOff size={10} />}>
                          No Limits
                        </Badge>
                      ) : config.permissions?.allow && config.permissions.allow.length > 0 ? (
                        <Badge size="xs" color="blue" variant="light" leftSection={<IconShield size={10} />}>
                          {config.permissions.allow.length} perms
                        </Badge>
                      ) : null}
                      <ActionIcon
                        size="xs"
                        variant="subtle"
                        color="red"
                        onClick={() => onRemoveProject(projectName)}
                      >
                        <IconTrash size={12} />
                      </ActionIcon>
                    </Group>
                  </Group>
                  <Text size="xs" c="dimmed" mt={4}>{config.path}</Text>

                  {/* Expandable Project Settings Editor */}
                  <Collapse in={isExpanded}>
                    <Stack gap="xs" mt="sm">
                      <Divider />
                      <TextInput
                        label="Dev Server URL"
                        placeholder="e.g., http://localhost:3000"
                        description="Full URL for the dev server. Leave empty to auto-detect based on project type"
                        value={editingDevServerUrl}
                        onChange={(e) => setEditingDevServerUrl(e.target.value)}
                      />
                      {config.hasE2E && (
                        <Textarea
                          label="E2E Testing Instructions"
                          placeholder={`How to run E2E tests for this project. Example:

1. Use Playwright MCP to interact with the browser
2. Navigate to the dev server URL
3. Test the user flows described in the test plan

Or for backend:
1. Use curl to test API endpoints
2. Check response status codes and JSON bodies`}
                          description="Custom methodology for running E2E tests (markdown supported). Leave empty to let the Planning Agent decide."
                          value={editingE2EInstructions}
                          onChange={(e) => setEditingE2EInstructions(e.target.value)}
                          minRows={4}
                          autosize
                        />
                      )}
                      <Divider label="Git Integration" labelPosition="left" />
                      <Checkbox
                        label="Enable Git Integration"
                        description="Create feature branches and auto-commit after each task"
                        checked={editingGitEnabled}
                        onChange={(e) => setEditingGitEnabled(e.currentTarget.checked)}
                      />
                      {editingGitEnabled && !gitAvailable && (
                        <Alert
                          icon={<IconAlertTriangle size={16} />}
                          color="orange"
                          variant="light"
                        >
                          Git CLI not found. Git features will not work until git is installed.
                        </Alert>
                      )}
                      <Collapse in={editingGitEnabled}>
                        <TextInput
                          label="Main Branch"
                          placeholder="main"
                          description="The default branch to create feature branches from"
                          value={editingMainBranch}
                          onChange={(e) => setEditingMainBranch(e.target.value)}
                        />
                      </Collapse>

                      {/* Permissions Section */}
                      <Divider label="Agent Permissions" labelPosition="left" />

                      <Switch
                        label="Dangerously Allow All"
                        description="Skip all permission checks (not recommended)"
                        checked={editingDangerouslyAllowAll}
                        onChange={(e) => setEditingDangerouslyAllowAll(e.currentTarget.checked)}
                        color="red"
                        thumbIcon={editingDangerouslyAllowAll ? <IconShieldOff size={12} /> : <IconShield size={12} />}
                      />

                      {!editingDangerouslyAllowAll && permissionsConfig && (
                        <Accordion variant="contained" radius="sm">
                          {/* Permission Groups */}
                          <Accordion.Item value="groups">
                            <Accordion.Control icon={<IconShield size={16} />}>
                              <Text size="sm" fw={500}>Quick Toggle Groups</Text>
                            </Accordion.Control>
                            <Accordion.Panel>
                              <Stack gap="xs">
                                {permissionsConfig.groups.map(group => {
                                  const allEnabled = group.permissions.every(p => editingPermissions.includes(p));
                                  const someEnabled = group.permissions.some(p => editingPermissions.includes(p));
                                  return (
                                    <Checkbox
                                      key={group.id}
                                      label={group.label}
                                      description={group.description}
                                      checked={allEnabled}
                                      indeterminate={someEnabled && !allEnabled}
                                      onChange={(e) => {
                                        if (e.currentTarget.checked) {
                                          // Add all group permissions
                                          setEditingPermissions(prev => [...new Set([...prev, ...group.permissions])]);
                                        } else {
                                          // Remove all group permissions
                                          setEditingPermissions(prev => prev.filter(p => !group.permissions.includes(p)));
                                        }
                                      }}
                                    />
                                  );
                                })}
                              </Stack>
                            </Accordion.Panel>
                          </Accordion.Item>

                          {/* Individual Permissions by Category */}
                          {permissionsConfig.categories.map(category => (
                            <Accordion.Item key={category.id} value={category.id}>
                              <Accordion.Control>
                                <Group gap="xs">
                                  <Text size="sm" fw={500}>{category.label}</Text>
                                  <Badge size="xs" variant="light">
                                    {category.permissions.filter(p => editingPermissions.includes(p.id)).length}/{category.permissions.length}
                                  </Badge>
                                </Group>
                              </Accordion.Control>
                              <Accordion.Panel>
                                <SimpleGrid cols={2} spacing="xs">
                                  {category.permissions.map(perm => (
                                    <Tooltip key={perm.id} label={perm.description} position="top-start" multiline w={250}>
                                      <Checkbox
                                        label={perm.label}
                                        checked={editingPermissions.includes(perm.id)}
                                        onChange={(e) => {
                                          if (e.currentTarget.checked) {
                                            setEditingPermissions(prev => [...prev, perm.id]);
                                          } else {
                                            setEditingPermissions(prev => prev.filter(p => p !== perm.id));
                                          }
                                        }}
                                        size="xs"
                                      />
                                    </Tooltip>
                                  ))}
                                </SimpleGrid>
                              </Accordion.Panel>
                            </Accordion.Item>
                          ))}
                        </Accordion>
                      )}

                      {editingDangerouslyAllowAll && (
                        <Alert icon={<IconAlertTriangle size={16} />} color="red" variant="light">
                          All permission checks will be skipped. The agent can execute any command without restrictions.
                        </Alert>
                      )}

                      <Group justify="flex-end">
                        <Button
                          size="xs"
                          variant="light"
                          leftSection={<IconDeviceFloppy size={14} />}
                          onClick={() => {
                            onUpdateProject(projectName, {
                              e2eInstructions: editingE2EInstructions.trim() || undefined,
                              devServer: {
                                ...config.devServer,
                                url: editingDevServerUrl.trim() || undefined,
                              },
                              gitEnabled: editingGitEnabled,
                              mainBranch: editingMainBranch.trim() || 'main',
                              permissions: {
                                dangerouslyAllowAll: editingDangerouslyAllowAll,
                                allow: editingPermissions,
                              },
                            });
                            setExpandedProject(null);
                          }}
                        >
                          Save Settings
                        </Button>
                      </Group>
                    </Stack>
                  </Collapse>
                </Card>
              );
              })}
            </Stack>
            </ScrollArea.Autosize>
          ) : !isLoading && (
            <Card padding="lg" withBorder bg="gray.0">
              <Text size="sm" c="dimmed" ta="center">
                No projects configured yet. Add one using the form on the right.
              </Text>
            </Card>
          )}
        </Stack>
      </Grid.Col>

      {/* RIGHT: Add Project Form */}
      <Grid.Col span={{ base: 12, md: 6 }}>
        <Stack gap="md">
          <Title order={5}>Add Project</Title>
          <SegmentedControl
                value={formMode}
                onChange={(v) => setFormMode(v as 'template' | 'existing')}
                data={[
                  { label: 'Add Existing', value: 'existing' },
                  { label: 'Create from Template', value: 'template' },
                ]}
                fullWidth
              />

              {/* Add Existing Project Form */}
              {formMode === 'existing' && (
                <>
                  <TextInput
                    label="Project Name"
                    placeholder="e.g., my-api"
                    description="Name to identify this project"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                  />

                  <TextInput
                    label="Project Path"
                    placeholder="e.g., ~/Documents/my-api"
                    description="Path to the existing project directory"
                    value={manualPath}
                    onChange={(e) => setManualPath(e.target.value)}
                    leftSection={<IconFolder size={16} />}
                  />

                  <TextInput
                    label="Dev Server Command"
                    placeholder="e.g., npm run dev"
                    description="Command to start the development server"
                    value={manualCommand}
                    onChange={(e) => setManualCommand(e.target.value)}
                  />

                  <TextInput
                    label="Ready Pattern"
                    placeholder="e.g., ready|listening|started"
                    description="Regex pattern to detect when server is ready"
                    value={manualReadyPattern}
                    onChange={(e) => setManualReadyPattern(e.target.value)}
                  />

                  <TextInput
                    label="Build Command"
                    placeholder="e.g., npm run build"
                    description="Command to build the project for production"
                    value={manualBuildCommand}
                    onChange={(e) => setManualBuildCommand(e.target.value)}
                  />

                  <TextInput
                    label="Dev Server URL"
                    placeholder="e.g., http://localhost:3000"
                    description="Full URL for the dev server. Leave empty to auto-detect based on project type"
                    value={manualDevServerUrl}
                    onChange={(e) => setManualDevServerUrl(e.target.value)}
                  />

                  <Checkbox
                    label="Has E2E tests"
                    checked={manualHasE2E}
                    onChange={(e) => setManualHasE2E(e.currentTarget.checked)}
                  />

                  <Collapse in={manualHasE2E}>
                    <Textarea
                      label="E2E Testing Instructions"
                      placeholder={`How to run E2E tests for this project. Example:

1. Use Playwright MCP to interact with the browser
2. Navigate to the dev server URL
3. Test the user flows described in the test plan

Or for backend:
1. Use curl to test API endpoints
2. Check response status codes and JSON bodies`}
                      description="Custom methodology for running E2E tests (markdown supported). Leave empty to let the Planning Agent decide."
                      value={manualE2EInstructions}
                      onChange={(e) => setManualE2EInstructions(e.target.value)}
                      minRows={4}
                      autosize
                    />
                  </Collapse>

                  <Checkbox
                    label="Install dependencies"
                    description="Automatically detects npm/yarn/pnpm/bun"
                    checked={manualDependencyInstall}
                    onChange={(e) => setManualDependencyInstall(e.currentTarget.checked)}
                  />

                  <Divider label="Git Integration" labelPosition="left" />

                  <Checkbox
                    label="Enable Git Integration"
                    description="Create feature branches and auto-commit after each task"
                    checked={manualGitEnabled}
                    onChange={(e) => setManualGitEnabled(e.currentTarget.checked)}
                  />

                  {manualGitEnabled && !gitAvailable && (
                    <Alert
                      icon={<IconAlertTriangle size={16} />}
                      color="orange"
                      variant="light"
                    >
                      Git CLI not found. Git features will not work until git is installed.
                    </Alert>
                  )}

                  <Collapse in={manualGitEnabled}>
                    <TextInput
                      label="Main Branch"
                      placeholder="main"
                      description="The default branch to create feature branches from"
                      value={manualMainBranch}
                      onChange={(e) => setManualMainBranch(e.target.value)}
                    />
                  </Collapse>

                  <Divider label="Agent Permissions" labelPosition="left" />

                  <Switch
                    label="Dangerously Allow All"
                    description="Skip all permission checks (not recommended)"
                    checked={manualDangerouslyAllowAll}
                    onChange={(e) => setManualDangerouslyAllowAll(e.currentTarget.checked)}
                    color="red"
                    thumbIcon={manualDangerouslyAllowAll ? <IconShieldOff size={12} /> : <IconShield size={12} />}
                  />

                  {!manualDangerouslyAllowAll && permissionsConfig && (
                    <Accordion variant="contained" radius="sm">
                      {/* Permission Groups */}
                      <Accordion.Item value="groups">
                        <Accordion.Control icon={<IconShield size={16} />}>
                          <Text size="sm" fw={500}>Quick Toggle Groups</Text>
                        </Accordion.Control>
                        <Accordion.Panel>
                          <Stack gap="xs">
                            {permissionsConfig.groups.map(group => {
                              const allEnabled = group.permissions.every(p => manualPermissions.includes(p));
                              const someEnabled = group.permissions.some(p => manualPermissions.includes(p));
                              return (
                                <Checkbox
                                  key={group.id}
                                  label={group.label}
                                  description={group.description}
                                  checked={allEnabled}
                                  indeterminate={someEnabled && !allEnabled}
                                  onChange={(e) => {
                                    if (e.currentTarget.checked) {
                                      setManualPermissions(prev => [...new Set([...prev, ...group.permissions])]);
                                    } else {
                                      setManualPermissions(prev => prev.filter(p => !group.permissions.includes(p)));
                                    }
                                  }}
                                />
                              );
                            })}
                          </Stack>
                        </Accordion.Panel>
                      </Accordion.Item>

                      {/* Individual Permissions by Category */}
                      {permissionsConfig.categories.map(category => (
                        <Accordion.Item key={category.id} value={category.id}>
                          <Accordion.Control>
                            <Group gap="xs">
                              <Text size="sm" fw={500}>{category.label}</Text>
                              <Badge size="xs" variant="light">
                                {category.permissions.filter(p => manualPermissions.includes(p.id)).length}/{category.permissions.length}
                              </Badge>
                            </Group>
                          </Accordion.Control>
                          <Accordion.Panel>
                            <SimpleGrid cols={2} spacing="xs">
                              {category.permissions.map(perm => (
                                <Tooltip key={perm.id} label={perm.description} position="top-start" multiline w={250}>
                                  <Checkbox
                                    label={perm.label}
                                    checked={manualPermissions.includes(perm.id)}
                                    onChange={(e) => {
                                      if (e.currentTarget.checked) {
                                        setManualPermissions(prev => [...prev, perm.id]);
                                      } else {
                                        setManualPermissions(prev => prev.filter(p => p !== perm.id));
                                      }
                                    }}
                                    size="xs"
                                  />
                                </Tooltip>
                              ))}
                            </SimpleGrid>
                          </Accordion.Panel>
                        </Accordion.Item>
                      ))}
                    </Accordion>
                  )}

                  {manualDangerouslyAllowAll && (
                    <Alert icon={<IconAlertTriangle size={16} />} color="red" variant="light">
                      All permission checks will be skipped. The agent can execute any command without restrictions.
                    </Alert>
                  )}

                  <Button
                    onClick={handleAddExisting}
                    disabled={!manualName.trim() || !manualPath.trim()}
                    leftSection={<IconFolderPlus size={14} />}
                  >
                    Add Project
                  </Button>
                </>
              )}

              {/* Create from Template Form */}
              {formMode === 'template' && (
                <>
                  <Select
                    label="Template"
                    placeholder="Select a template"
                    data={templateOptions}
                    value={selectedTemplate}
                    onChange={(v) => setSelectedTemplate(v as ProjectTemplate)}
                    leftSection={selectedTemplate?.includes('frontend') ? <IconBrowser size={16} /> : <IconServer size={16} />}
                  />

                  {selectedTemplateConfig && (
                    <Card padding="xs" withBorder bg="gray.0">
                      <Text size="sm">{selectedTemplateConfig.description}</Text>
                      <Group gap="xs" mt="xs">
                        <Badge size="xs" variant="outline">
                          {selectedTemplateConfig.devServer.command}
                        </Badge>
                        <Badge size="xs" variant="outline">
                          Port {selectedTemplateConfig.defaultPort}
                        </Badge>
                      </Group>
                    </Card>
                  )}

                  <TextInput
                    label="Project Name"
                    placeholder="e.g., my-backend"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />

                  <TextInput
                    label="Target Path"
                    placeholder="e.g., ~/Documents/my-backend"
                    description="Where to create the project directory"
                    value={targetPath}
                    onChange={(e) => setTargetPath(e.target.value)}
                  />

                  <Checkbox
                    label="Install dependencies after creating"
                    description="Automatically detects npm/yarn/pnpm/bun"
                    checked={templateDependencyInstall}
                    onChange={(e) => setTemplateDependencyInstall(e.currentTarget.checked)}
                  />

                  <Checkbox
                    label="Enable E2E testing"
                    description="Include this project in end-to-end test execution"
                    checked={templateHasE2E}
                    onChange={(e) => setTemplateHasE2E(e.currentTarget.checked)}
                  />

                  <Divider label="Git Integration" labelPosition="left" />

                  <Checkbox
                    label="Enable Git Integration"
                    description="Create feature branches and auto-commit after each task"
                    checked={templateGitEnabled}
                    onChange={(e) => setTemplateGitEnabled(e.currentTarget.checked)}
                  />

                  {templateGitEnabled && !gitAvailable && (
                    <Alert
                      icon={<IconAlertTriangle size={16} />}
                      color="orange"
                      variant="light"
                    >
                      Git CLI not found. Git features will not work until git is installed.
                    </Alert>
                  )}

                  <Collapse in={templateGitEnabled}>
                    <TextInput
                      label="Main Branch"
                      placeholder="main"
                      description="The default branch to create feature branches from"
                      value={templateMainBranch}
                      onChange={(e) => setTemplateMainBranch(e.target.value)}
                    />
                  </Collapse>

                  <Divider label="Agent Permissions" labelPosition="left" />

                  <Switch
                    label="Dangerously Allow All"
                    description="Skip all permission checks (not recommended)"
                    checked={templateDangerouslyAllowAll}
                    onChange={(e) => setTemplateDangerouslyAllowAll(e.currentTarget.checked)}
                    color="red"
                    thumbIcon={templateDangerouslyAllowAll ? <IconShieldOff size={12} /> : <IconShield size={12} />}
                  />

                  {!templateDangerouslyAllowAll && permissionsConfig && (
                    <Accordion variant="contained" radius="sm">
                      {/* Permission Groups */}
                      <Accordion.Item value="groups">
                        <Accordion.Control icon={<IconShield size={16} />}>
                          <Text size="sm" fw={500}>Quick Toggle Groups</Text>
                        </Accordion.Control>
                        <Accordion.Panel>
                          <Stack gap="xs">
                            {permissionsConfig.groups.map(group => {
                              const allEnabled = group.permissions.every(p => templatePermissions.includes(p));
                              const someEnabled = group.permissions.some(p => templatePermissions.includes(p));
                              return (
                                <Checkbox
                                  key={group.id}
                                  label={group.label}
                                  description={group.description}
                                  checked={allEnabled}
                                  indeterminate={someEnabled && !allEnabled}
                                  onChange={(e) => {
                                    if (e.currentTarget.checked) {
                                      setTemplatePermissions(prev => [...new Set([...prev, ...group.permissions])]);
                                    } else {
                                      setTemplatePermissions(prev => prev.filter(p => !group.permissions.includes(p)));
                                    }
                                  }}
                                />
                              );
                            })}
                          </Stack>
                        </Accordion.Panel>
                      </Accordion.Item>

                      {/* Individual Permissions by Category */}
                      {permissionsConfig.categories.map(category => (
                        <Accordion.Item key={category.id} value={category.id}>
                          <Accordion.Control>
                            <Group gap="xs">
                              <Text size="sm" fw={500}>{category.label}</Text>
                              <Badge size="xs" variant="light">
                                {category.permissions.filter(p => templatePermissions.includes(p.id)).length}/{category.permissions.length}
                              </Badge>
                            </Group>
                          </Accordion.Control>
                          <Accordion.Panel>
                            <SimpleGrid cols={2} spacing="xs">
                              {category.permissions.map(perm => (
                                <Tooltip key={perm.id} label={perm.description} position="top-start" multiline w={250}>
                                  <Checkbox
                                    label={perm.label}
                                    checked={templatePermissions.includes(perm.id)}
                                    onChange={(e) => {
                                      if (e.currentTarget.checked) {
                                        setTemplatePermissions(prev => [...prev, perm.id]);
                                      } else {
                                        setTemplatePermissions(prev => prev.filter(p => p !== perm.id));
                                      }
                                    }}
                                    size="xs"
                                  />
                                </Tooltip>
                              ))}
                            </SimpleGrid>
                          </Accordion.Panel>
                        </Accordion.Item>
                      ))}
                    </Accordion>
                  )}

                  {templateDangerouslyAllowAll && (
                    <Alert icon={<IconAlertTriangle size={16} />} color="red" variant="light">
                      All permission checks will be skipped. The agent can execute any command without restrictions.
                    </Alert>
                  )}

                  <Button
                    onClick={handleCreateFromTemplate}
                    disabled={!name.trim() || !targetPath.trim() || !selectedTemplate || isLoading}
                    loading={isLoading && formMode === 'template'}
                    leftSection={<IconPlus size={14} />}
                  >
                    Create Project
                  </Button>
                </>
              )}
        </Stack>
      </Grid.Col>
    </Grid>
  );
}
