import UserButton from "./UserButton";

export default function UserMenu({ children }) {
  // Full-size so the .h-screen percentage chain (see the utilities override
  // in index.css) reaches page roots through this route wrapper - a w-auto
  // h-auto box collapsed every private route to content height.
  return (
    <div className="w-full h-full">
      <UserButton />
      {children}
    </div>
  );
}
