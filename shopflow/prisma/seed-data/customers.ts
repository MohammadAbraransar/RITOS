export interface CustomerSeedData {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: "CUSTOMER" | "SUPPORT_ANALYST" | "ADMIN";
  accountAgeDays: number;
  riskMetadata: Record<string, any>;
  address: {
    street: string;
    city: string;
    state: string;
    pincode: string;
  };
}

export const USERS_SEED_DATA: CustomerSeedData[] = [
  {
    id: "CUS-10001",
    name: "Aarav Mehta",
    email: "aarav@example.com",
    phone: "+91 98765 43210",
    role: "CUSTOMER",
    accountAgeDays: 420,
    riskMetadata: { manual_watchlist: false },
    address: {
      street: "Flat 402, Lotus Residency, Hitech City",
      city: "Hyderabad",
      state: "Telangana",
      pincode: "500081",
    },
  },
  {
    id: "CUS-10002",
    name: "Diya Nair",
    email: "diya@example.com",
    phone: "+91 98765 43211",
    role: "CUSTOMER",
    accountAgeDays: 300,
    riskMetadata: { manual_watchlist: false },
    address: {
      street: "12 Marine Drive, Nariman Point",
      city: "Mumbai",
      state: "Maharashtra",
      pincode: "400021",
    },
  },
  {
    id: "CUS-10003",
    name: "Rohan Iyer",
    email: "rohan@example.com",
    phone: "+91 98765 43212",
    role: "CUSTOMER",
    accountAgeDays: 150,
    riskMetadata: { manual_watchlist: false },
    address: {
      street: "45 Anna Salai, T Nagar",
      city: "Chennai",
      state: "Tamil Nadu",
      pincode: "600017",
    },
  },
  {
    id: "CUS-10004",
    name: "Sneha Reddy",
    email: "sneha@example.com",
    phone: "+91 98765 43213",
    role: "CUSTOMER",
    accountAgeDays: 600,
    riskMetadata: { manual_watchlist: false },
    address: {
      street: "78 Jubilee Hills, Road No 36",
      city: "Hyderabad",
      state: "Telangana",
      pincode: "500033",
    },
  },
  {
    id: "CUS-10005",
    name: "Karthik Rao",
    email: "karthik@example.com",
    phone: "+91 98765 43214",
    role: "CUSTOMER",
    accountAgeDays: 90,
    riskMetadata: { manual_watchlist: false },
    address: {
      street: "101 Indiranagar 100ft Road",
      city: "Bengaluru",
      state: "Karnataka",
      pincode: "560038",
    },
  },
  {
    id: "CUS-10006",
    name: "Meera Joshi",
    email: "meera@example.com",
    phone: "+91 98765 43215",
    role: "CUSTOMER",
    accountAgeDays: 200,
    riskMetadata: { manual_watchlist: false },
    address: {
      street: "34 FC Road, Deccan Gymkhana",
      city: "Pune",
      state: "Maharashtra",
      pincode: "411004",
    },
  },
  {
    id: "CUS-10007",
    name: "Vikram Singh",
    email: "vikram@example.com",
    phone: "+91 98765 43216",
    role: "CUSTOMER",
    accountAgeDays: 500,
    riskMetadata: { manual_watchlist: false },
    address: {
      street: "88 Golf Course Road, DLF Phase 5",
      city: "Gurugram",
      state: "Haryana",
      pincode: "122002",
    },
  },
  {
    id: "CUS-10008",
    name: "Ananya Das",
    email: "ananya@example.com",
    phone: "+91 98765 43217",
    role: "CUSTOMER",
    accountAgeDays: 45,
    riskMetadata: { manual_watchlist: false },
    address: {
      street: "22 Park Street, Chowringhee",
      city: "Kolkata",
      state: "West Bengal",
      pincode: "700016",
    },
  },
  {
    id: "CUS-10009",
    name: "Kabir Shah",
    email: "kabir@example.com",
    phone: "+91 98765 43218",
    role: "CUSTOMER",
    accountAgeDays: 12,
    riskMetadata: { manual_watchlist: false, flags: ["high_refund_velocity"] },
    address: {
      street: "55 SG Highway, Bodakdev",
      city: "Ahmedabad",
      state: "Gujarat",
      pincode: "380054",
    },
  },
  {
    id: "CUS-10010",
    name: "Isha Kapoor",
    email: "isha@example.com",
    phone: "+91 98765 43219",
    role: "CUSTOMER",
    accountAgeDays: 250,
    riskMetadata: { manual_watchlist: false },
    address: {
      street: "19 Sector 17, Main Market",
      city: "Chandigarh",
      state: "Punjab",
      pincode: "160017",
    },
  },
  {
    id: "STF-SUPPORT-01",
    name: "Support Analyst",
    email: "support@shopflow.test",
    phone: "+91 90000 00001",
    role: "SUPPORT_ANALYST",
    accountAgeDays: 365,
    riskMetadata: {},
    address: {
      street: "ShopFlow Ops Center, Tech Park",
      city: "Bengaluru",
      state: "Karnataka",
      pincode: "560100",
    },
  },
  {
    id: "STF-ADMIN-01",
    name: "System Admin",
    email: "admin@shopflow.test",
    phone: "+91 90000 00002",
    role: "ADMIN",
    accountAgeDays: 365,
    riskMetadata: {},
    address: {
      street: "ShopFlow HQ, Cyber Towers",
      city: "Hyderabad",
      state: "Telangana",
      pincode: "500081",
    },
  },
];
