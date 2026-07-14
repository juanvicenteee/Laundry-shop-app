import "react-native-gesture-handler";

import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthProvider, useAuth } from "./src/lib/AuthContext";
import { CustomersScreen } from "./src/screens/CustomersScreen";
import { InventoryScreen } from "./src/screens/InventoryScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { OrdersScreen } from "./src/screens/OrdersScreen";
import { RequestsScreen } from "./src/screens/RequestsScreen";
import { colors } from "./src/theme";

type TabParamList = {
  Requests: undefined;
  Orders: undefined;
  Customers: undefined;
  Inventory: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

const icons: Record<keyof TabParamList, keyof typeof Ionicons.glyphMap> = {
  Requests: "notifications",
  Orders: "receipt",
  Customers: "people",
  Inventory: "cube"
};

function StaffTabs() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          height: 68 + insets.bottom,
          paddingBottom: 10 + insets.bottom,
          paddingTop: 8,
          borderTopColor: colors.line
        },
        tabBarIcon: ({ color, size }) => <Ionicons name={icons[route.name]} color={color} size={size} />
      })}
    >
      <Tab.Screen name="Requests" component={RequestsScreen} />
      <Tab.Screen name="Orders" component={OrdersScreen} />
      <Tab.Screen name="Customers" component={CustomersScreen} />
      <Tab.Screen name="Inventory" component={InventoryScreen} />
    </Tab.Navigator>
  );
}

function Root() {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!session || !profile) {
    return <LoginScreen />;
  }

  return <StaffTabs />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="dark" />
        <AuthProvider>
          <Root />
        </AuthProvider>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
