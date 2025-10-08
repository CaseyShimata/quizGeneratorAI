# Interview Q&A
1) architecture (include AI tool)
- Stack
  - NestJS
  - Expo React Native
  - MongoDB
- Packages
  - OpenAi API
  - TypeGoose
- Design Patterns
  - Model Controller Service
  - Module
  - Component Composition

2) Why architecture was chosen (include AI tool explanation)
- MongoDB is what I will be using at Entrata and it has advantages being fater to build out so 
it made sense to refresh on Document based database
- NestJS is also what we are using at Entrata and I love the opinionated modular structure 
-OpenAi API because there were several tutorial on using it and it seems very well supported
- TypeGoose because it makes it clean and easy to build entities and database structure as one instead of duplicatng code
- Expo React Native because I already had a project generator I build to get it up and running quickly and component 
composition makes building things that are complex yet modular so clean and quick

3) Tradeoffs to chosen architecture and approach
- MongoDB doesn't enforce normalization and typically it is used for when data will change often and we want less 
hops for faster fetching, but I still needed to use relationships because stuffing an array of emails into isSelected for 
a quiz->question->answer would really hurt us for queries in the long run so you still have to be smart about your db architecture
- Costs: other databases like DynamoDB and going serverless can save a ton if the complex abilities on mongodb aren't needed 
and this is only needed to run as a tool rather than a persistent server
- Speed as we scale. Go complies to machine code instead of being interpreted at run time so it is significantly faster than NodeJS
- Typegoose is slow at scale due to runtime reflection. Modern Mongoose allows TypeScript to infer types directly from the schema.

4) Future
- Add auth for requests
- Change out TypeGoose for modern mongoose type inference from schema
- Remove the redundant allowMultipleSelections .. it is assumed for future scalability if isCorrect is on multiple 
answers we allow multi selection. Add front end validation as well though this was not a frontend focused interview project
- Handle for duplicate topics using a lookup of user quiz but really a lookup and a fetch of an existing quiz before reaching out to AI.
- Add error handling
- Add more docblocks to the complex pieces in my server services and to my functions in client
- Add logging layer
- Add EndToEnd tests for endpoints
- Add unit tests for services
- Encrypt .env file and make it environment specific
- Add Devops layer (Pipeline, Terraform, Kubernetes, RDS)
- Change ScrollView to FlatList for history
- Modularize the functions in client to be in a separate rest folder and use axios package to optimze it
- Move hardcoded values such as the prompt, the tempurature, the frontEnd api url into .env and into reusable 
dynamic functions. This would allow scallability so the OpenAI call function becomes reusable by other services
being able to pass in dynamic return structures, tempuratures, role, prompts.. I could build a library of 
prompts, roles, responseFormats and contexts.

### Initial planning google doc:
https://docs.google.com/document/d/1uMG6pRVRcuOuW_OXv0An5mitHJ74Z9nJeDiH2b2XKmU/edit?tab=t.0#heading=h.n4sven8r9r19

# Database
- brew tap mongodb/brew
- brew install mongodb-community
- brew services start mongodb-community
- mongosh


# Server app
cd server
yarn install
yarn start:debug

### .env
Be sure to add your OpenAi API key to the .env file in server app


# Client app
cd client
yarn add expo
npx expo install --fix
npx expo start

### dependencies
You can use my dependency initializer app to get all of the dependencies to
run a expo app installed to your mac
https://github.com/CaseyShimata/projectAndDependencyInitializer