import {TodoItemInterface, TodoItemType} from "../../../types/TodoItemType";
import {View, Text, Button} from "react-native";

export const TodoTile: React.FC<TodoItemType> = ({ id, title, dueDate }) => {
    const formatDate = (date: Date | null) => {
        if (!date) return 'No due date';
        return date.toLocaleDateString();
    };

    return (
        <View>
            <Text>{title}</Text>
            <Text>Due: {formatDate(dueDate)}</Text>
            <Button
                title={"remove"}
                onPress={() => {console.log("remove item" + id)}}
            />
        </View>
    );
};