/**
 * MAIN.TSX - APP NAVIGATION SETUP
 * Root component that configures navigation structure
 * Located in: src/UI/layouts/Main.tsx
 */

import React, {useState} from 'react';
import {SafeAreaView, StatusBar, Text, FlatList, Button, TextInput} from "react-native";

/**
 * MAIN COMPONENT
 */
export default function Main() {

    return (
        <SafeAreaView style={{flex: 1, alignItems: 'center', justifyContent: 'center',}}>
            <StatusBar/>
            <Text>Hello World!</Text>


        </SafeAreaView>
    );
}
