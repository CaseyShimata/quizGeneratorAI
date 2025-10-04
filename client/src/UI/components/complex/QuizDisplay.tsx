import React from 'react';
import { View, Text, TouchableOpacity, Button } from 'react-native';
import { Quiz, UserQuiz } from '../../../types/QuizTypes';

interface QuizDisplayProps {
  quiz: Quiz;
  totalCorrect?: number;
  selectedAnswers?: Map<string, Set<string>>;
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
            const isSelected = selectedAnswers?.get(item.id)?.has(answer.id);
            
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
              return (
                <View key={answer.id} style={{ marginBottom: 8 }}>
                  <Text style={{ color: answer.isCorrect ? 'green' : '#666' }}>
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
          disabled={loading || !selectedAnswers || selectedAnswers.size === 0} 
        />
      )}
    </View>
  );
};
