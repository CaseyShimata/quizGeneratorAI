import React from 'react';
import { View, Text, TouchableOpacity, Button } from 'react-native';
import { Quiz, UserQuiz, QuestionSelectedAnswers } from '../../../types/QuizTypes';

interface QuizDisplayProps {
  quiz: Quiz;
  totalCorrect?: number;
  selectedAnswers?: Map<string, Set<string>> | QuestionSelectedAnswers[];
  onToggleAnswer?: (questionId: string, answerId: string) => void;
  onSubmit?: () => void;
  isActive?: boolean;
  loading?: boolean;
}

export const QuizDisplay: React.FC<QuizDisplayProps> = ({
  quiz,
  totalCorrect,
  selectedAnswers,
  onToggleAnswer,
  onSubmit,
  isActive = false,
  loading = false
}) => {
  const showDetails = !isActive;

  const selectedMap = React.useMemo(() => {
      if (!selectedAnswers) return new Map<string, Set<string>>();
      if (selectedAnswers instanceof Map) return selectedAnswers;

      const map = new Map<string, Set<string>>();
      selectedAnswers.forEach(qsa => {
          map.set(qsa.questionId, new Set(qsa.selectedAnswerIds));
      });
      return map;
  }, [selectedAnswers]);

  return (
    <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: '#ddd' }}>
      <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 10 }}>{quiz.topic}</Text>
      
      {showDetails && totalCorrect !== undefined && (
        <Text style={{ marginBottom: 15 }}>Score: {totalCorrect}/{quiz.quizItems.length}</Text>
      )}
      
      {quiz.quizItems.map((item, idx) => (
        <View key={item.id} style={{ marginBottom: 20 }}>
          <Text style={{ fontWeight: 'bold', marginBottom: 10 }}>{idx + 1}. {item.question}</Text>
          
          {item.answers.map(answer => {
            const isSelected = selectedMap.get(item.id)?.has(answer.id);

            if (isActive) {
              // Active quiz - show as selectable options
              return (
                <TouchableOpacity
                  key={answer.id}
                  onPress={() => onToggleAnswer?.(item.id, answer.id)}
                  style={{
                    padding: 10,
                    marginBottom: 5,
                    backgroundColor: isSelected ? '#e3f2fd' : '#fff',
                    borderWidth: 1,
                    borderColor: '#ccc',
                  }}
                >
                  <Text>{answer.text}</Text>
                </TouchableOpacity>
              );
            } else {
              // Completed quiz - show details
              let textColor = '#666';
              if (isSelected && answer.isCorrect) {
                textColor = 'green';
              } else if (isSelected && !answer.isCorrect) {
                textColor = 'red';
              }

              return (
                <View key={answer.id} style={{ marginBottom: 8 }}>
                  <Text style={{ color: textColor }}>
                    {answer.isCorrect ? '✓' : '✗'} {answer.text}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#666', marginLeft: 15 }}>
                    {answer.explanation}
                  </Text>
                </View>
              );
            }
          })}
        </View>
      ))}
      
      {isActive && onSubmit && (
        <Button
          title="Submit"
          onPress={onSubmit}
          disabled={loading || selectedMap.size === 0}
        />
      )}
    </View>
  );
};
