export interface OrderNotification {
  title: string;
  body: string;
  deepLink: string;
  priority?: 'default' | 'high';
}

export interface Notifier {
  send(notification: OrderNotification): Promise<void>;
}
