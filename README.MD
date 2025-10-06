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
- MongoDB doesn't enforce normalization and typically it is used for when data will be often changing and we want less 
hops for faster fetching, but I still needed to use relationships because stuffing an array of emails into isSelected for 
a quiz->question->answer would really hurt us for querys in the long run so you still have to be smart about your db architecture
- Costs: other databases like DynamoDB and going serverless can save a ton if the complex abilities on mongodb aren't needed 
and this is only needed to run as a tool rather than a persistent server
- Speed as we scale. Go complies to machine code instead of being interprited at run time so it is significantly faster than NodeJS


4) Future (out of scope)
- Add auth for requests
- Add error handling
- Add more docblocks to the complex pieces in my server services and to my functions in client
- Add logging layer
- Add EndToEnd tests for endpoints
- Add unit tests for services
- Encrypt .env file and make it environment specific
- Add Devops layer (Pipeline, Terraform, Kubernetes, RDS)
- Change ScrollView to FlatList for history
- Modularize the functions in client to be in a separate rest folder and use axios package to optimze it 

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