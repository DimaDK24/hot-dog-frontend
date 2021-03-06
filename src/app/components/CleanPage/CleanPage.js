import React, {Component} from 'react'
import {connect} from 'react-redux'
import PanelControl from './PanelControl/PanelControl'
import Public from './PublicGroup/Public'
import {bindActionCreators} from 'redux'
import {AddPublicButton} from './PublicGroup/AddPublicButton'
import swal from 'sweetalert'
import axios from 'axios'
import {
    GetUserGroups,
    LoadGroups,
    LoadCleanTasks
} from '../../../store/reducers/reducer.clean'
import ReactDOM from 'react-dom'
import {InputModal} from './InputModal'
import {VideoGuide} from './VideoGuide'
import {Redirect} from 'react-router-dom'

const CLEAN_TASK_ERRORS = ['Возникла ошибка', 'Завершили'] // errors? finished != error

class CleanPage extends Component {
    state = {
        publics: [],
        redirect: false
    }

    async componentWillMount() {
        const {GetUserGroups, LoadGroups, LoadCleanTasks} = this.props
        GetUserGroups()
        LoadGroups()
        LoadCleanTasks()

        let groups = await this.loadGroups()

        const cleanTasks = await this.loadCleanTasks()

        if (cleanTasks && cleanTasks.length)
            this.timerId = setInterval(async () => {
                await this.updateCleanTasks()
            }, 1500)
        groups = this.addCleanTaskToGroups(groups, cleanTasks)
        this.setGroups(groups)
    }

    renderGroups = (groups) => {
        if (!groups.length) return null
        return groups.map((publik) => <Public {...publik} key={publik.id} />)
    }

    componentWillUnmount() {
        if (this.timerId) {
            clearInterval(this.timerId)
        }
    }

    setGroups(groups) {
        for (const group of groups) {
            if (this.cleanTaskIsFinished(group.cleanData)) {
                this.showFinishedAlert(group)
            }
        }
        this.setState({publics: groups})
    }

    async loadCleanTasks() {
        return (await axios.get('https://hot-dog.site/api/getCleanTasks', {
            params: {
                user_vk_id: window.user_id,
                auth_key: window.auth_key
            }
        })).data
    }

    async loadGroups() {
        return (await axios.get('https://hot-dog.site/api/getPublics', {
            params: {
                user_vk_id: window.user_id,
                auth_key: window.auth_key
            }
        })).data
    }

    async showModal() {
        const addingPublicLink = await swal({
            text: 'Введите ссылку на сообщество:',
            content: 'input',
            button: 'Добавить!'
        })
        let publicId
        try {
            publicId = await this.convertPublicLinkToId(addingPublicLink)
        } catch (e) {
            console.log(e)
        }
        const newPublic = await this.addPublicAndGetItsData(publicId)
        newPublic.dogs = 'анализ'
        newPublic.cleanData = {
            isCleaning: false
        }
        newPublic.onClean = async () => {
            await this.startCleanPublicById(newPublic.id)
        }
        console.log(newPublic)
        this.setState((prevState) => {
            console.log(prevState)
            const publics = prevState.publics.concat(newPublic)
            console.log(publics)
            return {publics: publics}
        })
        const dogs = await this.getDogsCount(newPublic.id)
        this.setState((prevState) => {
            const alreadyAddedPublic = this.getPublicById(
                prevState.publics,
                newPublic.id
            )
            alreadyAddedPublic.dogs = dogs
            return {publics: prevState.publics}
        })
    }

    async startCleanPublicById(publicId) {
        const response = await this.startCleanTasks([publicId])
        if ('error' in response) {
            if (response.error.id === 1) {
                const accessToken = await this.getAccessTokenFromUser()
                await this.setAccessToken(accessToken)
                return await this.onStartClean()
            } else if (response.error.id === 2) {
                await this.showNotEnoughMoneyModal(response.error.value)
            }
        } else {
            const publics = this.setCleaningStateOnPublicById(publicId)
            this.setGroups(publics)
            this.timerId = setInterval(async () => {
                await this.updateCleanTasks()
                console.log(this)
                await this.props.updateBalance()
            }, 1500)
        }
    }

    async convertPublicLinkToId(link) {
        const searchElement = 'vk.com/'
        if (!link.includes(searchElement)) {
            throw new Error('no vk.com in link')
        }
        const name = link.slice(
            link.indexOf(searchElement) + searchElement.length
        )
        if (this.isId(name)) {
            return this.getPublicId(name)
        }
        return await this.resolvePublicName(name)
    }

    async onStartClean() {
        const public_ids = this.getPublicIds()
        const response = await this.startCleanTasks(public_ids)
        if ('error' in response) {
            if (response.error.id === 1) {
                const accessToken = await this.getAccessTokenFromUser()
                await this.setAccessToken(accessToken)
                return await this.onStartClean()
            } else if (response.error.id === 2) {
                await this.showNotEnoughMoneyModal(response.error.value)
            }
        } else {
            const publics = this.setCleaningStateOnPublics()
            this.setGroups(publics)
            this.timerId = setInterval(async () => {
                await this.updateCleanTasks()
                await this.props.updateBalance()
            }, 1500)
        }
    }

    setCleaningStateOnPublics() {
        return this.state.publics.map((item) => {
            item.cleanData = {
                isCleaning: true,
                progress: 0,
                status: 'Отправляем запрос'
            }
            return item
        })
    }

    setCleaningStateOnPublicById(publicId) {
        const publics = this.state.publics.slice()
        const publicIndex = publics.findIndex((item) => item.id === publicId)
        publics[publicIndex].cleanData = {
            isCleaning: true,
            progress: 0,
            status: 'Отправляем запрос'
        }
        return publics
    }

    async startCleanTasks(public_ids) {
        return (await axios.post('https://hot-dog.site/api/startCleanTasks', {
            user_vk_id: window.user_id,
            auth_key: window.auth_key,
            public_ids: public_ids
        })).data
    }

    cleanTaskIsFinished(cleanTask) {
        return CLEAN_TASK_ERRORS.includes(cleanTask.status)
    }

    getPublicIds() {
        return this.state.publics.map((item) => item.id)
    }

    resolvePublicName(name) {
        return new Promise((resolve, reject) => {
            /*global VK*/
            VK.api(
                'utils.resolveScreenName',
                {
                    screen_name: name,
                    v: '5.85'
                },
                ({response}) => {
                    if (response.type === 'group') {
                        // noinspection JSUnresolvedVariable
                        resolve(response.object_id)
                    }
                    reject('not group')
                }
            )
        })
    }

    isId(name) {
        return Boolean(name.match(/^((club)|(public))\d+$/))
    }

    getPublicId(id) {
        return +id.match(/\d+$/)[0]
    }

    async addPublicAndGetItsData(publicId) {
        return (await axios.post('https://hot-dog.site/api/addPublic', {
            user_vk_id: window.user_id,
            auth_key: window.auth_key,
            vk_id: publicId
        })).data
    }

    async getDogsCount(publicId) {
        // noinspection JSUnresolvedVariable
        return (await axios.get('https://hot-dog.site/api/getDogsCount', {
            params: {
                id: publicId,
                user_vk_id: window.user_id,
                auth_key: window.auth_key
            }
        })).data.dogs_count
    }

    async getAccessTokenFromUser() {
        let wrapper = window.document.createElement('div')
        ReactDOM.render(<InputModal />, wrapper)
        let el = wrapper.firstChild
        const response = await swal({
            title: 'Упс. Мы не можем очистить ваши сообщества',
            content: el,
            buttons: {
                confirm: {
                    text: 'Сохранить и запустить!',
                    value: ''
                }
            }
        })
        return this.getAccessTokenFromLink(response)
    }

    async setAccessToken(token) {
        return await axios.patch('https://hot-dog.site/api/setAccessToken', {
            access_token: token,
            user_vk_id: window.user_id,
            auth_key: window.auth_key
        })
    }

    addCleanTaskToGroups(publics, cleanTasks) {
        if (cleanTasks && cleanTasks.length) {
            for (const publik of publics) {
                publik.onClean = async () => {
                    await this.startCleanPublicById(publik.id)
                }
                for (const cleanTask of cleanTasks) {
                    // noinspection JSUnresolvedVariable
                    if (publik.id === cleanTask.public_id)
                        publik.cleanData = {
                            isCleaning: true,
                            progress: cleanTask.progress,
                            status: cleanTask.status
                        }
                }
                if (!publik.cleanData) {
                    publik.cleanData = {
                        isCleaning: false
                    }
                }
            }
            return publics
        }
        return publics.map((publik) => {
            publik.cleanData = {isCleaning: false}
            publik.onClean = async () => {
                await this.startCleanPublicById(publik.id)
            }
            return publik
        })
    }

    async getCleanTasks() {
        return (await axios.get('https://hot-dog.site/api/getCleanTasks', {
            params: {
                user_vk_id: window.user_id,
                auth_key: window.auth_key
            }
        })).data
    }

    async updateCleanTasks() {
        const cleanTasks = await this.getCleanTasks()
        if (!(cleanTasks && cleanTasks.length)) {
            clearInterval(this.timerId)
            for (const publik of this.state.publics) {
                await this.refreshPublicById(publik.id)
            }
            await this.showCommentAlert()
            return
        }
        const publics = this.addCleanTaskToGroups(
            this.state.publics,
            cleanTasks
        )
        this.setGroups(publics)
    }

    showFinishedAlert(publik) {}

    render() {
        const {publics} = this.state
        return (
            <div className="clean">
                <PanelControl onCleanClick={() => this.onStartClean()} />
                <div className="publics">
                    {publics && this.renderGroups(publics)}
                </div>
                <AddPublicButton onClick={() => this.showModal()} />
                <VideoGuide />
                {/*{showGroupsModal && <Modal/>}*/}
                {this.state.redirect && (
                    <Redirect to={this.state.redirect} push />
                )}
            </div>
        )
    }

    async refreshPublicById(publicId) {
        const freshPublic = await this.getFreshPublic(publicId)
        freshPublic.cleanData = {
            isCleaning: false
        }
        freshPublic.onClean = async () => {
            await this.startCleanPublicById(freshPublic.id)
        }
        const {publics} = this.state
        const freshPublicIndex = publics.findIndex(
            (item) => item.id === publicId
        )
        publics[freshPublicIndex] = freshPublic
        this.setGroups(publics)
    }

    async getFreshPublic(public_id) {
        return (await axios.get('https://hot-dog.site/api/refreshPublic', {
            params: {
                user_vk_id: window.user_id,
                auth_key: window.auth_key,
                id: public_id
            }
        })).data
    }

    getAccessTokenFromLink(link) {
        const searchStartStr = '#access_token='
        const searchEndStr = '&expires_in='
        return link.slice(
            link.indexOf(searchStartStr) + searchStartStr.length,
            link.indexOf(searchEndStr)
        )
    }

    getPublicById(publics, public_id) {
        return publics.find((item) => item.id === public_id)
    }

    async showNotEnoughMoneyModal(money) {
        const response = await swal({
            title: 'Упс.. Недостаточно денег',
            icon: 'error',
            text: `Для очистки сообществ нужно еще ${money}р.\nПополните, пожалуйста, баланс`,
            button: {text: 'Пополнить'}
        })
        if (response) this.setState({redirect: '/add_money'})
    }

    async showCommentAlert() {
        const response = await swal({
            title: 'Спасибо!',
            icon: 'success',
            text: 'Оставьте, пожалуйста, отзыв о сервисе :)',
            button: 'Хорошо'
        })
        if (response) this.setState({redirect: '/feedback'})
    }
}

const mapStateToProps = ({clean}) => ({
    groups: clean.groups,
    hotDogsGroups: clean.hotDogsGroups,
    cleanTasks: clean.cleanTasks
})

const mapDispatchToProps = (dispatch) =>
    bindActionCreators({GetUserGroups, LoadGroups, LoadCleanTasks}, dispatch)
export default connect(
    mapStateToProps,
    mapDispatchToProps
)(CleanPage)
