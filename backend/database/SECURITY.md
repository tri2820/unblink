# Database Query Security

## Overview

The `executeREST` function implements multiple layers of security to prevent SQL injection and other attacks.

## Security Measures

### 1. **Dynamic Schema Validation**
- Schema is automatically detected from the database using `PRAGMA table_info`
- Only existing tables and their actual columns can be queried
- Schema is cached for performance
- Attempting to query non-existent tables or columns throws an error
- Prevents: `SELECT * FROM users; DROP TABLE media_units;--`
- **Benefit**: No manual updates needed when schema changes

### 2. **Column Validation**
- All columns are validated against the dynamic schema
- Both qualified (`table.column`) and unqualified columns are validated
- Only actual database columns are allowed
- Prevents: `SELECT * FROM media_units WHERE password; DROP TABLE--`

### 3. **SQL Identifier Validation**
- All identifiers (tables, columns, aliases) are validated with regex
- Pattern: `^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?( as [a-zA-Z_][a-zA-Z0-9_]*)?$`
- Prevents special characters and SQL keywords in identifiers

### 4. **Parameterized Queries**
- All user values are passed as parameters (using `?` placeholders)
- The database driver handles proper escaping
- Prevents: `WHERE id = '1' OR '1'='1'`

### 5. **Join Validation**
- Join tables must be in whitelist
- Join column names must exist in respective table whitelists
- Maximum 10 joins allowed to prevent performance issues

### 6. **Resource Limits**
- Max 50 select fields (prevents memory exhaustion)
- Max 10 joins (prevents query complexity)
- Max 20 WHERE conditions (prevents query complexity)
- Max 100 values in IN clause (prevents memory issues)
- Max 200 results per query (prevents data exfiltration)

### 7. **Operation Validation**
- Only allowed operations: `equals`, `in`, `is_not`, `like`
- ORDER BY direction must be `ASC` or `DESC`
- IN operator requires array values
- LIKE operator requires string values

## Schema Detection

The database schema is automatically detected at runtime:

```typescript
// Get all tables from sqlite_master
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();

// For each table, get column names using PRAGMA
const columns = db.prepare(`PRAGMA table_info(${table})`).all();
```

Schema is cached in memory for performance. Use `clearSchemaCache()` to force a refresh after schema changes.

## Example Attack Prevention

### SQL Injection via Table Name
```typescript
// ❌ BLOCKED
await executeREST({
    table: 'media_units; DROP TABLE media_units;--'
})
// Error: Invalid table
```

### SQL Injection via Field Name
```typescript
// ❌ BLOCKED
await executeREST({
    table: 'media_units',
    where: [{ field: 'id\' OR \'1\'=\'1', op: 'equals', value: 'test' }]
})
// Error: Invalid field identifier
```

### Column Enumeration
```typescript
// ❌ BLOCKED
await executeREST({
    table: 'media_units',
    select: ['id', 'password', 'secret_key']
})
// Error: Invalid field: password
```

### Resource Exhaustion
```typescript
// ❌ BLOCKED
await executeREST({
    table: 'media_units',
    select: Array(1000).fill('id')
})
// Error: Too many select fields (max 50)
```

## Best Practices

1. **Never concatenate user input into SQL**
   - Always use parameterized queries
   - Validate all identifiers against whitelist

2. **Keep whitelists minimal**
   - Only expose columns that are actually needed
   - Review whitelist regularly

3. **Monitor query patterns**
   - Log suspicious query attempts
   - Set up alerts for validation errors

4. **Regular security audits**
   - Review code for new SQL concatenation
   - Test with SQL injection payloads
   - Update tests when adding new features

## Testing

Security tests are in `backend/database/tests/query.test.ts`:
- Invalid table names
- SQL injection attempts
- Invalid columns
- Invalid joins
- Resource limit enforcement

Run tests: `bun test backend/database/tests/query.test.ts`
