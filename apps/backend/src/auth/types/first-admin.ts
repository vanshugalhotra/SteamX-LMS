export type FirstAdminInput = {
  steamxId: string;
  password: string;
  name?: string;
};

export type FirstAdminResult = {
  created: boolean;
  steamxId: string;
};

export class FirstAdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = FirstAdminError.name;
  }
}
