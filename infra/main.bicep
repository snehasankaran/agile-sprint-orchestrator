targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Name of the environment')
param environmentName string

@minLength(1)
@description('Primary location for all resources')
param location string

param orchestratorImageName string = ''

@secure()
param azureOpenAiApiKey string
param azureOpenAiEndpoint string
param azureOpenAiDeployment string = 'gpt-4o'
param azureOpenAiApiVersion string = '2024-12-01-preview'

var abbrs = loadJsonContent('./abbreviations.json')
var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))
var tags = { 'azd-env-name': environmentName }

resource rg 'Microsoft.Resources/resourceGroups@2022-09-01' = {
  name: 'rg-${environmentName}'
  location: location
  tags: tags
}

module containerAppsEnvironment 'modules/container-apps-environment.bicep' = {
  name: 'container-apps-environment'
  scope: rg
  params: {
    name: '${abbrs.appManagedEnvironments}${resourceToken}'
    location: location
    tags: tags
  }
}

module orchestrator 'modules/container-app.bicep' = {
  name: 'orchestrator'
  scope: rg
  params: {
    name: '${abbrs.appContainerApps}orch-${resourceToken}'
    location: location
    tags: union(tags, { 'azd-service-name': 'orchestrator' })
    containerAppsEnvironmentName: containerAppsEnvironment.outputs.name
    imageName: orchestratorImageName
    targetPort: 6060
    env: [
      { name: 'PORT', value: '6060' }
      { name: 'AZURE_OPENAI_API_KEY', secretRef: 'azure-openai-key' }
      { name: 'AZURE_OPENAI_ENDPOINT', value: azureOpenAiEndpoint }
      { name: 'AZURE_OPENAI_DEPLOYMENT', value: azureOpenAiDeployment }
      { name: 'AZURE_OPENAI_API_VERSION', value: azureOpenAiApiVersion }
    ]
    secrets: [
      { name: 'azure-openai-key', value: azureOpenAiApiKey }
    ]
  }
}

output ORCHESTRATOR_URL string = orchestrator.outputs.fqdn
