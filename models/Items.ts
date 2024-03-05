export const ItemsTable = 'items';

export interface IItemsModel {
  id?: number;
  item_number: number;
  uid: string;
  count?: number;
  held_by?: number;
}
