#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, Symbol,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InvalidScope = 4,
}


#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Scope {
    Renewals = 1 << 0,
    GiftCards = 1 << 1,
    Approvals = 1 << 2,
}



#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Agent(Address),
}

#[contract]
pub struct AgentRegistry;

#[contractimpl]
impl AgentRegistry {
    /// Initialize the contract with an admin address.
    pub fn init(env: Env, admin: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        Ok(())
    }

    fn require_admin(env: &Env) -> Result<Address, Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;

        admin.require_auth();
        Ok(admin)
    }


    /// Register a new agent. Admin only.
    pub fn register(env: Env, agent: Address) -> Result<(), Error> {
        Self::require_admin(&env)?;

        env.storage()
            .persistent()
            .set(&DataKey::Agent(agent.clone()), &true);

        env.events()
            .publish((symbol_short!("agent"), symbol_short!("reg")), agent);

        Ok(())
    }

    pub fn update_scopes(
        env: Env,
        agent: Address,
        scopes: u32,
    ) -> Result<(), Error> {
        Self::require_admin(&env)?;

        if !env.storage().persistent().has(&DataKey::Agent(agent.clone())) {
            return Err(Error::Unauthorized);
        }

        env.storage()
            .persistent()
            .set(&DataKey::Agent(agent.clone()), &scopes);

        env.events().publish(
            (symbol_short!("agent"), symbol_short!("scopes")),
            (agent, scopes),
        );

        Ok(())
    }


    /// Revoke an agent's authorization. Admin only.
    pub fn revoke_agent(env: Env, agent: Address) -> Result<(), Error> {
        Self::require_admin(&env)?;

        env.storage()
            .persistent()
            .remove(&DataKey::Agent(agent.clone()));

        env.events().publish(
            (symbol_short!("agent"), symbol_short!("revoke")),
            agent,
        );

        Ok(())
    }

    /// Check if an agent is authorized.
    pub fn is_authorized(env: Env, agent: Address) -> bool {
        env.storage().persistent().has(&DataKey::Agent(agent))
    }

    /// Panic if an agent is not authorized.
    pub fn require_authorized(env: Env, agent: Address) {
        if !Self::is_authorized(env, agent) {
            panic!("agent not authorized");
        }
    }

       pub fn has_scope(env: Env, agent: Address, scope: Scope) -> bool {
        match env
            .storage()
            .persistent()
            .get::<_, u32>(&DataKey::Agent(agent))
        {
            Some(mask) => (mask & scope as u32) != 0,
            None => false,
        }
    }

      /// Enforce agent authorization + scope
    pub fn require_scope(env: Env, agent: Address, scope: Scope) {
        agent.require_auth();

        if !Self::has_scope(env, agent, scope) {
            panic!("agent missing required scope");
        }
    }
    
}

mod test;
