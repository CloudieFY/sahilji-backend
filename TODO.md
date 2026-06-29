# Backend MVC with MongoDB Atlas - Progress

## Approved Plan Summary
Node/Express/Mongoose REST API in `/backend` with MVC structure.
Entities: Item, Customer, Rental (match frontend types).
Full CRUD + rental creation logic (compute total, update item/customer counters).
Frontend integration with TanStack Query later.

## Steps
- [x] 1. Create `/backend` dir, package.json (.env.example, .gitignore), manual npm install
- [x] 2. utils/counterModel.js (custom ID gen VV-001, C-1046, R-2214)
- [x] 3. models/ (Item.js, Customer.js, Rental.js with pre-save ID gen, enums, refs, timestamps)

- [x] 4. controllers/ (full CRUD; rental create w/ total calc + item/customer updates)
- [x] 5. routes/ (items.js, customers.js, rentals.js)
- [x] 6. server.js (DB connect, CORS localhost:5173, port 3001)
- [x] 7. data/seed.js (from frontend mock.ts)
- [ ] 8. Test API (npm run dev)
- [ ] 9. Frontend: react-query, api hooks replace store.tsx
- [ ] 10. Update forms/routes

**Next**: User run `npm install` in backend/, confirm. Provide MongoDB Atlas URI for .env (or use .env.example).

Current: Step 1 done.
