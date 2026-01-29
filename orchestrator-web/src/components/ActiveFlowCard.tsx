import { useState, useEffect } from 'react';
import { Group, Badge, Text, Loader, Stack, Button, Radio, Checkbox } from '@mantine/core';
import { IconCheck, IconQuestionMark } from '@tabler/icons-react';
import type { RequestFlow, PlanningQuestion, PlanningStatusEvent, PlanningQuestionItem } from '@aio/types';
import { GlassCard, GlassTextarea, GlassTextInput } from '../theme';

interface ActiveFlowCardProps {
  flow: RequestFlow;
  pendingQuestion?: PlanningQuestion | null;
  onAnswerQuestion?: (questionId: string, answer: string) => void;
  planningStatus?: PlanningStatusEvent | null;
}

function getFlowColor(type: string): string {
  switch (type) {
    case 'e2e': return 'peach';
    case 'task': return 'peach';
    case 'planning': return 'peach';
    case 'fix': return 'honey';
    case 'info': return 'gray';
    case 'success': return 'sage';
    case 'waiting': return 'peach';
    default: return 'peach';
  }
}

// Component for rendering question input based on type
function QuestionInput({
  question,
  onSubmit,
  isLastQuestion,
}: {
  question: PlanningQuestionItem;
  onSubmit: (answer: string) => void;
  isLastQuestion: boolean;
}) {
  const questionType = question.type || 'text';
  const options = question.options || [];

  // State for different input types
  const [textAnswer, setTextAnswer] = useState('');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(new Set());
  const [customInput, setCustomInput] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  // Reset state when question changes
  useEffect(() => {
    setTextAnswer('');
    setSelectedOption(null);
    setSelectedOptions(new Set());
    setCustomInput('');
    setShowCustomInput(false);
  }, [question.question]);

  const handleSubmit = () => {
    let answer = '';

    if (questionType === 'text') {
      answer = textAnswer.trim();
    } else if (questionType === 'select_one') {
      if (selectedOption === '__custom__') {
        answer = customInput.trim();
      } else {
        answer = selectedOption || '';
      }
    } else if (questionType === 'select_many') {
      const selected = Array.from(selectedOptions);
      // Replace __custom__ with actual custom input
      const finalSelections = selected.map(s => s === '__custom__' ? customInput.trim() : s).filter(Boolean);
      answer = finalSelections.join(', ');
    }

    if (answer) {
      onSubmit(answer);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey) {
      handleSubmit();
    }
  };

  const canSubmit = () => {
    if (questionType === 'text') {
      return textAnswer.trim().length > 0;
    } else if (questionType === 'select_one') {
      if (selectedOption === '__custom__') {
        return customInput.trim().length > 0;
      }
      return selectedOption !== null;
    } else if (questionType === 'select_many') {
      if (selectedOptions.has('__custom__')) {
        return customInput.trim().length > 0 || selectedOptions.size > 1;
      }
      return selectedOptions.size > 0;
    }
    return false;
  };

  // Render text input (default)
  if (questionType === 'text') {
    return (
      <>
        <GlassTextarea
          placeholder="Your answer..."
          value={textAnswer}
          onChange={(e) => setTextAnswer(e.target.value)}
          onKeyDown={handleKeyDown}
          autosize
          minRows={2}
          maxRows={6}
        />
        <Group justify="space-between" align="center">
          <Text size="xs" c="dimmed">Cmd+Enter to submit</Text>
          <Button size="xs" color="peach" onClick={handleSubmit} disabled={!canSubmit()}>
            {isLastQuestion ? 'Submit Answer' : 'Next Question'}
          </Button>
        </Group>
      </>
    );
  }

  // Render single select (radio buttons)
  if (questionType === 'select_one') {
    return (
      <>
        <Radio.Group
          value={selectedOption || ''}
          onChange={(value) => {
            setSelectedOption(value);
            setShowCustomInput(value === '__custom__');
          }}
        >
          <Stack gap="xs">
            {options.map((option) => (
              <Radio key={option} value={option} label={option} size="sm" color="peach" />
            ))}
            <Radio value="__custom__" label="Custom..." size="sm" color="peach" />
          </Stack>
        </Radio.Group>
        {showCustomInput && (
          <GlassTextInput
            placeholder="Enter custom answer..."
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={handleKeyDown}
            size="sm"
            mt="xs"
          />
        )}
        <Group justify="space-between" align="center" mt="xs">
          <Text size="xs" c="dimmed">Cmd+Enter to submit</Text>
          <Button size="xs" color="peach" onClick={handleSubmit} disabled={!canSubmit()}>
            {isLastQuestion ? 'Submit Answer' : 'Next Question'}
          </Button>
        </Group>
      </>
    );
  }

  // Render multi-select (checkboxes)
  if (questionType === 'select_many') {
    const toggleOption = (option: string) => {
      const newSet = new Set(selectedOptions);
      if (newSet.has(option)) {
        newSet.delete(option);
        if (option === '__custom__') {
          setShowCustomInput(false);
        }
      } else {
        newSet.add(option);
        if (option === '__custom__') {
          setShowCustomInput(true);
        }
      }
      setSelectedOptions(newSet);
    };

    return (
      <>
        <Stack gap="xs">
          {options.map((option) => (
            <Checkbox
              key={option}
              checked={selectedOptions.has(option)}
              onChange={() => toggleOption(option)}
              label={option}
              size="sm"
              color="peach"
            />
          ))}
          <Checkbox
            checked={selectedOptions.has('__custom__')}
            onChange={() => toggleOption('__custom__')}
            label="Custom..."
            size="sm"
            color="peach"
          />
        </Stack>
        {showCustomInput && (
          <GlassTextInput
            placeholder="Enter custom answer..."
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={handleKeyDown}
            size="sm"
            mt="xs"
          />
        )}
        <Group justify="space-between" align="center" mt="xs">
          <Text size="xs" c="dimmed">
            {selectedOptions.size > 0 ? `${selectedOptions.size} selected` : 'Select options'} · Cmd+Enter to submit
          </Text>
          <Button size="xs" color="peach" onClick={handleSubmit} disabled={!canSubmit()}>
            {isLastQuestion ? 'Submit Answer' : 'Next Question'}
          </Button>
        </Group>
      </>
    );
  }

  return null;
}

export function ActiveFlowCard({ flow, pendingQuestion, onAnswerQuestion, planningStatus }: ActiveFlowCardProps) {
  const activeStep = flow.steps.find(s => s.status === 'active');
  const completedSteps = flow.steps.filter(s => s.status === 'completed');
  const color = getFlowColor(flow.type);

  // Only show question for planning flows
  const showQuestion = pendingQuestion && flow.type === 'planning';

  // Get current question from array
  const currentQuestion = showQuestion
    ? pendingQuestion.questions[pendingQuestion.currentIndex]
    : null;
  const questionProgress = showQuestion
    ? `${pendingQuestion.currentIndex + 1}/${pendingQuestion.questions.length}`
    : null;
  const isLastQuestion = showQuestion
    ? pendingQuestion.currentIndex >= pendingQuestion.questions.length - 1
    : false;

  // For planning flows, show planningStatus message if available
  const statusMessage = flow.type === 'planning' && planningStatus?.message
    ? planningStatus.message
    : activeStep?.message;

  const handleSubmitAnswer = (answer: string) => {
    if (pendingQuestion && onAnswerQuestion) {
      onAnswerQuestion(pendingQuestion.questionId, answer);
    }
  };

  // Get question type label
  const getQuestionTypeLabel = (type?: string) => {
    switch (type) {
      case 'select_one': return 'Select one';
      case 'select_many': return 'Select all that apply';
      default: return null;
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
      {/* Current active step with spinner - shown when no question pending */}
      {!showQuestion && statusMessage && (
        <Stack gap={4}>
          <Group gap="sm" justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
              <Loader size={16} color={color} />
              <Text size="sm" style={{ color: 'var(--text-body)' }}>
                {statusMessage}
              </Text>
            </Group>
            {flow.project && (
              <Badge size="xs" variant="light" color={color}>
                {flow.project}
              </Badge>
            )}
          </Group>
          {flow.taskName && (
            <Text size="xs" c="dimmed" ml={28}>
              {flow.taskName}
            </Text>
          )}
        </Stack>
      )}

      {/* Planning Question UI */}
      {showQuestion && currentQuestion && (
        <Stack gap="xs">
          <Group gap="xs" justify="space-between">
            <Group gap="xs">
              <IconQuestionMark size={16} style={{ color: 'var(--text-heading)' }} />
              <Text size="sm" fw={500} style={{ color: 'var(--text-heading)' }}>
                Clarification Needed
              </Text>
            </Group>
            <Group gap="xs">
              {getQuestionTypeLabel(currentQuestion.type) && (
                <Badge size="xs" variant="outline" color="gray">
                  {getQuestionTypeLabel(currentQuestion.type)}
                </Badge>
              )}
              {pendingQuestion.questions.length > 1 && (
                <Badge size="xs" variant="light" color="peach">
                  Question {questionProgress}
                </Badge>
              )}
            </Group>
          </Group>
          <Text size="sm" style={{ color: 'var(--text-body)' }}>{currentQuestion.question}</Text>
          {currentQuestion.context && (
            <Text size="xs" c="dimmed" fs="italic">
              Context: {currentQuestion.context}
            </Text>
          )}
          <QuestionInput
            question={currentQuestion}
            onSubmit={handleSubmitAnswer}
            isLastQuestion={isLastQuestion}
          />
        </Stack>
      )}

      {/* Show completed steps if any */}
      {completedSteps.length > 0 && (
        <Stack gap={4} mt={statusMessage || showQuestion ? 'xs' : 0}>
          {completedSteps.map((step) => (
            <Group key={step.id} gap="xs">
              <IconCheck size={12} style={{ color: 'var(--color-success)' }} />
              <Text size="xs" c="dimmed">{step.message}</Text>
            </Group>
          ))}
        </Stack>
      )}
    </GlassCard>
  );
}
