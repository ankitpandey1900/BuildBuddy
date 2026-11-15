import React, { useState } from 'react';

export function App() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <h1>BuildBuddy React App</h1>
      <button onClick={() => setCount(count + 1)}>Count: {count}</button>
    </div>
  );
}

