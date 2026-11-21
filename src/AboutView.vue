<script setup>
defineProps({ municipal: Object });
</script>

<template>
  <div class="list doc">
    <section class="panel">
      <h2>Primeiros passos</h2>
      <ol>
        <li>Use <strong>Produtores</strong> para cadastrar uma propriedade e seu volume previsto.</li>
        <li>Use <strong>Rotas</strong> para escolher uma data e adicionar as paradas na ordem da coleta.</li>
        <li>Abra a rota e registre os litros ou indique o motivo da ocorrência.</li>
        <li>Na rota, use <strong>Encerrar rota</strong> para revisar as paradas e liberar o CSV.</li>
        <li>Use o <strong>Painel</strong> para acompanhar volumes e ocorrências por data.</li>
      </ol>
    </section>
    <section class="panel">
      <h2>Uso offline e sincronização</h2>
      <p>Abra o sistema online antes de sair. Sem conexão, você pode consultar a última rota carregada e registrar o resultado das paradas. O aplicativo envia os registros ao recuperar a conexão enquanto estiver aberto. Use o botão Sincronizar agora para atualizar. Novas rotas e propriedades precisam de conexão.</p>
      <p>O acesso publicado é privado. Para consultar do computador os registros feitos no celular, abra o mesmo endereço com a conta autorizada e sincronize o celular.</p>
    </section>
    <section class="panel">
      <h2>Origem dos dados</h2>
      <p>O total anual de Colméia reproduz a Pesquisa da Pecuária Municipal do IBGE. Os volumes das rotas, ocorrências e propriedades iniciais são fictícios e identificados como demonstração.</p>
      <p v-if="municipal"><a :href="municipal.officialUrl" target="_blank" rel="noopener">Consultar a tabela 74 do SIDRA</a></p>
      <p><a href="https://www.infoteca.cnptia.embrapa.br/infoteca/handle/doc/1190705" target="_blank" rel="noopener">Estudo da Embrapa sobre a cadeia do leite em Colméia</a></p>
    </section>
  </div>
</template>
