export interface HomebrewItem {
  id: string;
  name: string;
  type: 'class' | 'item' | 'spell';
  description: string;
  createdAt: Date;
}
