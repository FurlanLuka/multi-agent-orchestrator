import { Stack, Text, Group, Button, List, Badge, ScrollArea } from '@mantine/core';
import { IconListCheck, IconMessage } from '@tabler/icons-react';
import type { StageApprovalRequest, RefinedFeatureData, TechnicalSpecData } from '@orchy/types';
import { GlassCard, GlassTextarea } from '../../theme';
import { useState } from 'react';

interface StageApprovalCardProps {
  approval: StageApprovalRequest;
  onApprove: () => void;
  onReject: (feedback: string) => void;
}

const STAGE_TITLES: Record<string, string> = {
  feature_refinement: 'Feature Refinement',
  exploration_planning: 'Exploration & Planning',
  task_generation: 'Task Generation',
};

export function StageApprovalCard({ approval, onApprove, onReject }: StageApprovalCardProps) {
  const [feedback, setFeedback] = useState('');

  const renderContent = () => {
    const { data } = approval;

    switch (data.type) {
      case 'refined_feature': {
        const featureData = data as RefinedFeatureData;
        return (
          <Stack gap="sm">
            <Text size="sm" fw={500}>Refined Description</Text>
            <Text size="sm" c="dimmed">{featureData.refinedDescription}</Text>
            {featureData.keyRequirements && featureData.keyRequirements.length > 0 && (
              <>
                <Text size="sm" fw={500}>Key Requirements</Text>
                <List size="sm" spacing="xs">
                  {featureData.keyRequirements.map((r, i) => (
                    <List.Item key={i}>{r}</List.Item>
                  ))}
                </List>
              </>
            )}
          </Stack>
        );
      }

      case 'technical_spec': {
        const techData = data as TechnicalSpecData;
        return (
          <Stack gap="sm">
            {techData.apiContracts && techData.apiContracts.length > 0 && (
              <>
                <Text size="sm" fw={500}>API Contracts ({techData.apiContracts.length})</Text>
                <Stack gap="xs">
                  {techData.apiContracts.map((contract, idx) => (
                    <GlassCard key={idx} p="sm">
                      <Group gap="xs" mb={4}>
                        <Badge size="xs" variant="filled" color="sage">{contract.method}</Badge>
                        <Text size="sm" fw={500} style={{ fontFamily: 'monospace' }}>{contract.endpoint}</Text>
                      </Group>
                      {contract.providedBy && (
                        <Text size="xs" c="dimmed">
                          Provided by: {contract.providedBy}
                          {contract.consumedBy && contract.consumedBy.length > 0 && ` | Used by: ${contract.consumedBy.join(', ')}`}
                        </Text>
                      )}
                    </GlassCard>
                  ))}
                </Stack>
              </>
            )}
            {techData.architectureDecisions && techData.architectureDecisions.length > 0 && (
              <>
                <Text size="sm" fw={500}>Architecture Decisions</Text>
                <List size="sm" spacing="xs">
                  {techData.architectureDecisions.map((decision, i) => (
                    <List.Item key={i}>{decision}</List.Item>
                  ))}
                </List>
              </>
            )}
            {techData.executionOrder && techData.executionOrder.length > 0 && (
              <>
                <Text size="sm" fw={500}>Execution Order</Text>
                <Stack gap="xs">
                  {techData.executionOrder.map((item, idx) => (
                    <Group key={idx} gap="xs">
                      <Badge size="xs" variant="light" color="gray">{idx + 1}</Badge>
                      <Text size="sm">{item.project}</Text>
                      {item.dependsOn && item.dependsOn.length > 0 && (
                        <Text size="xs" c="dimmed">(after: {item.dependsOn.join(', ')})</Text>
                      )}
                    </Group>
                  ))}
                </Stack>
              </>
            )}
          </Stack>
        );
      }

      default:
        return <Text size="sm" c="dimmed">Stage data ready for review</Text>;
    }
  };

  const handleReject = () => {
    if (feedback.trim()) {
      onReject(feedback);
      setFeedback('');
    }
  };

  return (
    <GlassCard
      p="sm"
      style={{
        backgroundColor: 'rgba(160, 130, 110, 0.06)',
        borderColor: 'rgba(160, 130, 110, 0.15)',
      }}
    >
      <Stack gap="md">
        <Group gap="sm">
          <IconListCheck size={20} style={{ color: 'var(--text-heading)' }} />
          <Text size="sm" fw={600} style={{ color: 'var(--text-heading)' }}>
            {STAGE_TITLES[approval.stage] || 'Stage'} Ready for Review
          </Text>
        </Group>

        {/* Content area with scroll for long content */}
        <ScrollArea.Autosize mah={300}>
          {renderContent()}
        </ScrollArea.Autosize>

        <GlassTextarea
          placeholder="Type feedback to request changes..."
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          minRows={2}
        />

        <Group gap="xs" c="dimmed">
          <IconMessage size={16} />
          <Text size="xs">
            Type feedback above to request changes, or approve to continue
          </Text>
        </Group>

        <Group justify="flex-end" gap="sm">
          <Button
            variant="light"
            color="gray"
            size="sm"
            onClick={handleReject}
            disabled={!feedback.trim()}
          >
            Request Changes
          </Button>
          <Button
            variant="filled"
            color="peach"
            size="sm"
            onClick={onApprove}
          >
            Approve
          </Button>
        </Group>
      </Stack>
    </GlassCard>
  );
}
