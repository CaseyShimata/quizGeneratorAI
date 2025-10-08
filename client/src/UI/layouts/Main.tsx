import React, {useState} from 'react';
import {SafeAreaView, ScrollView, View, TextInput, Button, Text, Alert} from 'react-native';
import {Quiz, QuestionSelectedAnswers, UserQuiz} from '../../types/QuizTypes';
import {QuizDisplay} from '../components/complex/QuizDisplay';

const API_BASE_URL = 'http://127.0.0.1:3000/api';

export default function Main() {
    const [email, setEmail] = useState('');
    const [topic, setTopic] = useState('');
    const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
    const [selectedAnswers, setSelectedAnswers] = useState<Map<string, Set<string>>>(new Map());
    const [submittedQuiz, setSubmittedQuiz] = useState<UserQuiz | null>(null);
    const [history, setHistory] = useState<UserQuiz[]>([]);
    const [loading, setLoading] = useState(false);

    const generateQuiz = async () => {
        if (!email || !topic) return;

        setLoading(true);
        setActiveQuiz(null);
        setSubmittedQuiz(null);
        setSelectedAnswers(new Map());

        try {
            const res = await fetch(`${API_BASE_URL}/quiz/generate`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({email, topic}),
            });
            const data = await res.json();
            setActiveQuiz(data.quiz);
        } catch (error) {
            Alert.alert('Error', 'Failed to generate quiz');
        } finally {
            setLoading(false);
        }
    };

    const submitQuiz = async () => {
        if (!activeQuiz) return;

        setLoading(true);
        const questionsSelectedAnswers: QuestionSelectedAnswers[] = Array.from(selectedAnswers.entries()).map(
            ([questionId, answerIds]) => ({
                questionId,
                selectedAnswerIds: Array.from(answerIds)
            })
        );

        try {
            const res = await fetch(`${API_BASE_URL}/quiz/grade`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({email, quiz: activeQuiz, questionsSelectedAnswers: questionsSelectedAnswers}),
            });
            const result = await res.json();
            setSubmittedQuiz(result);
            setHistory(prev => [result, ...prev]);
            setActiveQuiz(null);
        } catch (error) {
            Alert.alert('Error', 'Failed to submit quiz');
        } finally {
            setLoading(false);
        }
    };

    const loadHistory = async () => {
        if (!email) return;

        setLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/quiz/list?email=${encodeURIComponent(email)}`);
            const data = await res.json();
            setHistory(data);
        } catch (error) {
            Alert.alert('Error', 'Failed to load history');
        } finally {
            setLoading(false);
        }
    };

    const toggleAnswer = (questionId: string, answerId: string) => {
        const newSelections = new Map(selectedAnswers);
        const currentAnswers = newSelections.get(questionId) || new Set();

        if (currentAnswers.has(answerId)) {
            currentAnswers.delete(answerId);
        } else {
            currentAnswers.add(answerId);
        }

        newSelections.set(questionId, currentAnswers);
        setSelectedAnswers(newSelections);
    };

    return (
        <SafeAreaView style={{flex: 1}}>
            <ScrollView>

                <Text style={{fontSize: 30}}>QUIZ GENERATOR AI</Text>
                <TextInput
                    placeholder="Email"
                    value={email}
                    onChangeText={setEmail}
                    style={{borderWidth: 1, borderColor: '#ccc', padding: 10, marginBottom: 10}}
                />
                <TextInput
                    placeholder="Topic"
                    value={topic}
                    onChangeText={setTopic}
                    style={{borderWidth: 1, borderColor: '#ccc', padding: 10, marginBottom: 10}}
                />
                <Button
                    title={loading ? 'Loading...' : 'Generate Quiz'}
                    onPress={generateQuiz}
                    disabled={loading || !email || !topic}
                />
                <Button
                    title="Load History"
                    onPress={loadHistory}
                    disabled={loading || !email}
                />

                <Text style={{fontSize: 20}}>ACTIVE QUIZ</Text>
                {activeQuiz && (
                    <QuizDisplay
                        quiz={activeQuiz}
                        selectedAnswers={selectedAnswers}
                        onToggleAnswer={toggleAnswer}
                        onSubmit={submitQuiz}
                        isActive={true}
                        loading={loading}
                    />
                )}

                {submittedQuiz && (
                    <QuizDisplay
                        quiz={submittedQuiz.quiz}
                        totalCorrect={submittedQuiz.totalCorrect}
                    />
                )}

                <Text style={{fontSize: 20}}>HISTORY</Text>
                {history.map((userQuiz, idx) => (
                    <QuizDisplay
                        key={idx}
                        quiz={userQuiz.quiz}
                        totalCorrect={userQuiz.totalCorrect}
                    />
                ))}
            </ScrollView>
        </SafeAreaView>
    );
}
