import React from 'react';

export type TodoItemType = {
    id: number;
    title: string;
    dueDate?: Date;
}

export interface TodoItemInterface {
    todo: TodoItemType
}